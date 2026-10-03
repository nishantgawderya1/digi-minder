import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractBillWithAi,
  validateExtraction,
} from "@/lib/bill-extraction.server";
import { extractBillFields } from "@/lib/ocr";

const text =
  "Test Electronics\nInvoice TEST-1001\nDate: 02/10/2026\nAcme Air Purifier A20\nS/N: 001234567890\nEAN: 00998877\nGrand total INR 12,999.00\nWarranty: 1 year";
const candidate = () => ({
  fields: {
    name: "Acme Air Purifier A20",
    retailer: "Test Electronics",
    invoiceNumber: "TEST-1001",
    serialNumber: "001234567890",
    barcode: "00998877",
    purchasePrice: "12999.00",
    currency: "INR",
    purchaseDate: "2026-02-10",
    warrantyMonths: 12,
  },
  evidence: {
    name: "Acme Air Purifier A20",
    retailer: "Test Electronics",
    invoiceNumber: "Invoice TEST-1001",
    serialNumber: "S/N: 001234567890",
    barcode: "EAN: 00998877",
    purchasePrice: "Grand total INR 12,999.00",
    currency: "Grand total INR 12,999.00",
    purchaseDate: "Date: 02/10/2026",
    warrantyMonths: "Warranty: 1 year",
  },
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("Evidence-checked AI bill fields", () => {
  it("does not turn invoice-table headers into product names", () => {
    expect(
      extractBillFields("Product Description Qty Discount IGST CESS Total")
        .name,
    ).toBe("");
  });
  it("preserves the selected invoice's fields and flags a multiple-invoice file", () => {
    const result = validateExtraction(
      { ...candidate(), multipleInvoices: true },
      text,
    );
    expect(result.multipleInvoices).toBe(true);
    expect(result.fields.invoiceNumber).toBe("TEST-1001");
  });
  it("detects separate invoice numbers even when the model omits the flag", () => {
    const result = validateExtraction(
      candidate(),
      text + "\nInvoice No: SERVICE000123\nInvoice Number # GOODS000456",
    );
    expect(result.multipleInvoices).toBe(true);
  });
  it("ignores malformed extra evidence without discarding valid fields", () => {
    const value = candidate();
    expect(
      validateExtraction(
        { ...value, evidence: { ...value.evidence, extraFlag: false } },
        text,
      ).fields.serialNumber,
    ).toBe("001234567890");
  });
  it("does not discard valid bill fields for unknown optional model metadata", () => {
    const result = validateExtraction(
      { ...candidate(), nameStatus: "found", multipleInvoices: null },
      text,
    );
    expect(result.fields.name).toBe("Acme Air Purifier A20");
    expect(result.multipleInvoices).toBe(false);
  });
  it("preserves zero-prefixed identifiers and parses day-first dates from evidence", () => {
    expect(validateExtraction(candidate(), text).fields).toMatchObject({
      name: "Acme Air Purifier A20",
      retailer: "Test Electronics",
      serialNumber: "001234567890",
      barcode: "00998877",
      purchasePrice: "12999.00",
      purchaseDate: "2026-10-02",
      warrantyExpiresAt: "2027-10-02",
      returnWindowDays: null,
    });
  });
  it("discards unsupported facts, invented evidence, numeric identifiers, and extra owner fields", () => {
    const value = candidate();
    const result = validateExtraction(
      {
        fields: {
          ...value.fields,
          serialNumber: 1234567890,
          name: "Invented laptop",
          warrantyMonths: 24,
          modelNumber: "SECRET",
          returnWindowDays: 30,
          userId: "another-user",
          reminderDays: [],
        },
        evidence: {
          ...value.evidence,
          modelNumber: "Fake source quote",
          returnWindowDays: "Grand total INR 12,999.00",
        },
      },
      text,
    );
    expect(result.discarded).toBe(true);
    expect(result.fields).toMatchObject({
      name: "",
      serialNumber: null,
      modelNumber: null,
      warrantyMonths: null,
      returnWindowDays: null,
      reminderDays: [30, 7, 1],
    });
    expect(result.fields).not.toHaveProperty("userId");
  });
  it("does not accept arbitrary monetary values or impossible dates", () => {
    const value = candidate();
    expect(
      validateExtraction(
        {
          fields: { purchasePrice: "5.00", purchaseDate: "2026-02-01" },
          evidence: {
            purchasePrice: value.evidence.purchasePrice,
            purchaseDate: "31/02/2026",
          },
        },
        text + "\n31/02/2026",
      ).fields,
    ).toMatchObject({ purchasePrice: null, purchaseDate: null });
  });
});
describe("NVIDIA LLM boundary", () => {
  it("uses the supplied model with JSON mode and never streams reasoning into fields", async () => {
    vi.stubEnv("NVIDIA_LLM_API_KEY", "test-key");
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify(candidate()),
                reasoning_content: "not bill data",
              },
            },
          ],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetch);
    const result = await extractBillWithAi(text);
    expect(result.method).toBe("nvidia-llm");
    expect(result.fields.serialNumber).toBe("001234567890");
    const request = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(fetch.mock.calls[0]![1].headers).not.toHaveProperty(
      "NVCF-POLL-SECONDS",
    );
    expect(request).toMatchObject({
      model: "nvidia/nemotron-3.5-lightning-30b-a3b",
      stream: false,
      temperature: 0,
      response_format: { type: "json_object" },
      chat_template_kwargs: { enable_thinking: false },
    });
    expect(request.messages[0].content).toContain("untrusted OCR text");
    expect(JSON.parse(request.messages[1].content)).toEqual({
      pages: [{ page: 1, text }],
    });
  });
  it("does not call the model for missing keys, empty input or oversized documents", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.stubEnv("NVIDIA_LLM_API_KEY", "");
    vi.stubEnv("NVIDIA_API_KEY", "");
    vi.stubEnv("NVIDIA_NEMOTRON_OCR_API_KEY", "");
    expect((await extractBillWithAi(text)).method).toBe("labels");
    vi.stubEnv("NVIDIA_LLM_API_KEY", "test-key");
    expect((await extractBillWithAi("")).warning).toContain("No readable text");
    expect((await extractBillWithAi("x".repeat(60_001))).warning).toContain(
      "too much text",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it("automatically maps fields using the existing OCR key without a separate LLM key", async () => {
    vi.stubEnv("NVIDIA_LLM_API_KEY", "");
    vi.stubEnv("NVIDIA_API_KEY", "");
    vi.stubEnv("NVIDIA_NEMOTRON_OCR_API_KEY", "shared-test-key");
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: { content: JSON.stringify(candidate()) },
            },
          ],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetch);
    const result = await extractBillWithAi(text);
    expect(result.method).toBe("nvidia-llm");
    expect(result.fields.serialNumber).toBe("001234567890");
    expect(fetch.mock.calls[0]![1].headers.Authorization).toBe(
      "Bearer shared-test-key",
    );
  });
  it.each([401, 429, 500])(
    "preserves label-derived fields when NVIDIA returns %s",
    async (status) => {
      vi.stubEnv("NVIDIA_LLM_API_KEY", "test-key");
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            new Response("private provider details", { status }),
          ),
      );
      const result = await extractBillWithAi("Serial number: 001234");
      expect(result.method).toBe("labels");
      expect(result.fields.serialNumber).toBe("001234");
      expect(result.warning).not.toContain("private provider");
    },
  );
  it.each(["length", "content_filter"])(
    "rejects incomplete completions: %s",
    async (finish_reason) => {
      vi.stubEnv("NVIDIA_LLM_API_KEY", "test-key");
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              choices: [
                {
                  finish_reason,
                  message: { content: JSON.stringify(candidate()) },
                },
              ],
            }),
          ),
        ),
      );
      expect((await extractBillWithAi(text)).method).toBe("labels");
    },
  );
});

const wrapped =
  "Acme Back Cover for Apple\nHSN 3926 Qty 1 Total 170.00\niPhone 11 Blue";
const wrappedName = "Acme Back Cover for Apple iPhone 11 Blue";
const wrappedCandidate = () => ({
  fields: { name: wrappedName, purchasePrice: "170.00" },
  evidence: { name: wrapped, purchasePrice: "Total 170.00" },
  productNameParts: ["Acme Back Cover for Apple", "iPhone 11 Blue"],
});
const response = (content: unknown, finish_reason = "stop") =>
  new Response(
    JSON.stringify({
      choices: [
        { finish_reason, message: { content: JSON.stringify(content) } },
      ],
    }),
  );

describe("Source-backed product-name recovery", () => {
  it("joins ordered literal fragments while retaining the entire raw description", () => {
    const result = validateExtraction(wrappedCandidate(), wrapped);
    expect(result.fields.name).toBe(wrappedName);
    expect(result.evidence.name).toBe(wrapped);
    expect(result.productDescription).toEqual({
      text: wrapped,
      parts: wrappedCandidate().productNameParts,
    });
    expect(result.fieldIssues.name).toBeUndefined();
  });
  it.each(
    [
      ["Acme Back Cover for Apple", "iPhone 12 Blue"],
      ["iPhone 11 Blue", "Acme Back Cover for Apple"],
      ["Acme Back Cover for Apple", "iPhone 11 Blue", "iPhone 11 Blue"],
    ].map((parts) => ({ parts })),
  )(
    "rejects invented, reordered or duplicate fragments: $parts",
    ({ parts }) => {
      const name = parts.join(" ");
      const result = validateExtraction(
        { ...wrappedCandidate(), fields: { name }, productNameParts: parts },
        wrapped,
      );
      expect(result.fields.name).toBe("");
      expect(result.fieldIssues.name).toBe("rejected");
    },
  );
  it("still rejects first-line-only or synthesized supporting quotes", () => {
    for (const quote of ["Acme Back Cover for Apple", wrappedName]) {
      const result = validateExtraction(
        { ...wrappedCandidate(), evidence: { name: quote } },
        wrapped,
      );
      expect(result.fields.name).toBe("");
    }
  });
  it("does not extend fragment matching to serial numbers", () => {
    const result = validateExtraction(
      {
        fields: { serialNumber: "001234" },
        evidence: { serialNumber: "00 HSN 12 TOTAL 34" },
        productNameParts: ["00", "12", "34"],
      },
      "00 HSN 12 TOTAL 34",
    );
    expect(result.fields.serialNumber).toBeNull();
  });
  it("rejects grounded table headers and unreadable placeholders as product names", () => {
    for (const name of [
      "Product Description Qty Total",
      "[unreadable]",
      "Product Description Qty Total [unreadable]",
    ]) {
      expect(
        validateExtraction({ fields: { name }, evidence: { name } }, name)
          .fields.name,
      ).toBe("");
    }
    for (const [name, source] of [
      ["Acme Store", "Retailer: Acme Store"],
      ["Test Customer", "Buyer: Test Customer"],
    ]) {
      expect(
        validateExtraction({ fields: { name }, evidence: { name } }, source)
          .fields.name,
      ).toBe("");
    }
    expect(
      validateExtraction(
        { fields: { name: "Acme Lamp" }, evidence: { name: "Acme Lamp" } },
        "Retailer: Acme Lamp\nProduct name: Acme Lamp",
      ).fields.name,
    ).toBe("Acme Lamp");
  });
  it("does not turn a printed order/SKU into a serial when the serial label is empty", () => {
    const source = "Serial Number: [[]]\nOrder ID: 000123\nSKU: 000456";
    for (const serialNumber of ["000123", "000456"]) {
      const result = validateExtraction(
        { fields: { serialNumber }, evidence: { serialNumber } },
        source,
      );
      expect(result.fields.serialNumber).toBeNull();
    }
    expect(
      validateExtraction(
        {
          fields: { serialNumber: "001234" },
          evidence: { serialNumber: "001234" },
        },
        "Serial number:\n001234",
      ).fields.serialNumber,
    ).toBe("001234");
  });
  it("does not accept a single product's identity when metadata flags several items", () => {
    for (const metadata of [{ productCount: 2 }, { nameStatus: "ambiguous" }]) {
      const result = validateExtraction(
        {
          ...wrappedCandidate(),
          ...metadata,
          fields: {
            ...wrappedCandidate().fields,
            brand: "Acme",
            serialNumber: "001234",
          },
          evidence: {
            ...wrappedCandidate().evidence,
            brand: "Acme",
            serialNumber: "001234",
          },
        },
        wrapped + "\nSerial 001234",
      );
      expect(result.fields).toMatchObject({
        name: "",
        brand: null,
        serialNumber: null,
        purchasePrice: "170.00",
      });
      expect(result.fieldIssues.name).toBe("ambiguous");
    }
  });
  it("repairs only the rejected name and charges both calls before sending", async () => {
    vi.stubEnv("NVIDIA_LLM_API_KEY", "test-key");
    const first = wrappedCandidate();
    first.evidence.name = "Acme Back Cover for Apple";
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(first))
      .mockResolvedValueOnce(
        response({
          ...wrappedCandidate(),
          fields: {
            name: wrappedName,
            purchasePrice: "999.00",
            serialNumber: "invented",
          },
        }),
      );
    vi.stubGlobal("fetch", fetch);
    const beforeRequest = vi.fn().mockResolvedValue(true);
    const result = await extractBillWithAi(wrapped, { beforeRequest });
    expect(result.fields).toMatchObject({
      name: wrappedName,
      purchasePrice: "170.00",
      serialNumber: null,
    });
    expect(result.diagnostics).toMatchObject({
      requests: 2,
      repairedName: true,
    });
    expect(beforeRequest).toHaveBeenCalledTimes(2);
    expect(beforeRequest.mock.invocationCallOrder[0]).toBeLessThan(
      fetch.mock.invocationCallOrder[0]!,
    );
    expect(beforeRequest.mock.invocationCallOrder[1]).toBeLessThan(
      fetch.mock.invocationCallOrder[1]!,
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each([429, 500])(
    "preserves valid fields if name repair fails with %s",
    async (status) => {
      vi.stubEnv("NVIDIA_LLM_API_KEY", "test-key");
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(
          response({
            fields: { purchasePrice: "170.00" },
            evidence: { purchasePrice: "Total 170.00" },
          }),
        )
        .mockResolvedValueOnce(new Response("private", { status }));
      vi.stubGlobal("fetch", fetch);
      const result = await extractBillWithAi(wrapped);
      expect(result.fields.purchasePrice).toBe("170.00");
      expect(result.fields.name).toBe("");
      expect(result.method).toBe("nvidia-llm");
      expect(result.warning).toContain("Other extracted details are preserved");
      expect(result.warning).not.toContain("private");
    },
  );
  it("does not spend another request on explicit ambiguity, absence or a user correction", async () => {
    vi.stubEnv("NVIDIA_LLM_API_KEY", "test-key");
    for (const options of [
      { nameStatus: "ambiguous" },
      { nameStatus: "absent" },
      { skipNameRepair: true },
    ]) {
      const fetch = vi.fn().mockResolvedValue(
        response({
          fields: {},
          evidence: {},
          nameStatus: "nameStatus" in options ? options.nameStatus : undefined,
        }),
      );
      vi.stubGlobal("fetch", fetch);
      await extractBillWithAi(wrapped, {
        skipNameRepair: "skipNameRepair" in options,
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });
  it("preserves the first extraction when no retry budget remains", async () => {
    vi.stubEnv("NVIDIA_LLM_API_KEY", "test-key");
    const fetch = vi.fn().mockResolvedValue(
      response({
        fields: { purchasePrice: "170.00" },
        evidence: { purchasePrice: "Total 170.00" },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const beforeRequest = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const result = await extractBillWithAi(wrapped, { beforeRequest });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.fields.purchasePrice).toBe("170.00");
  });
  it("uses bounded reasoning only for an explicitly enabled repair, never its text as fields", async () => {
    vi.stubEnv("NVIDIA_LLM_API_KEY", "test-key");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response({ fields: {}, evidence: {} }))
      .mockResolvedValueOnce(response(wrappedCandidate()));
    vi.stubGlobal("fetch", fetch);
    const result = await extractBillWithAi(wrapped, { repairThinking: true });
    const requests = fetch.mock.calls.map((call) => JSON.parse(call[1].body));
    expect(requests[0].chat_template_kwargs.enable_thinking).toBe(false);
    expect(requests[1]).toMatchObject({
      reasoning_budget: 512,
      max_tokens: 3000,
      chat_template_kwargs: { enable_thinking: true },
      response_format: { type: "json_object" },
    });
    expect(result.diagnostics.reasoningUsed).toBe(true);
  });
});

describe("Invoice scope isolation", () => {
  const pages = [
    {
      page: 1,
      text: "Invoice Number: SHIPPING0001\nTotal 50.00\nCourier Express",
    },
    { page: 2, text: `Invoice Number: GOODS0002\n${wrapped}\nStore Acme` },
    { page: 3, text: "Invoice Number: FEE0003\nTotal 7.00" },
  ];
  const raw = pages
    .map((page) => `[Page ${page.page}]\n${page.text}`)
    .join("\n\n");
  it("accepts only source quotes inside the selected goods invoice", () => {
    const result = validateExtraction(
      {
        ...wrappedCandidate(),
        invoicePages: [2],
        fields: { ...wrappedCandidate().fields, retailer: "Courier Express" },
        evidence: {
          ...wrappedCandidate().evidence,
          retailer: "Courier Express",
        },
      },
      raw,
      pages,
    );
    expect(result.fields.name).toBe(wrappedName);
    expect(result.fields.purchasePrice).toBe("170.00");
    expect(result.fields.retailer).toBeNull();
  });
  it.each(
    [undefined, [], [1, 2], [9], [2, 2]].map((invoicePages) => ({
      invoicePages,
    })),
  )(
    "leaves all suggestions blank for unclear invoice pages: $invoicePages",
    ({ invoicePages }) => {
      const result = validateExtraction(
        { ...wrappedCandidate(), invoicePages },
        raw,
        pages,
      );
      expect(result.source.ambiguous).toBe(true);
      expect(result.fields.name).toBe("");
      expect(result.fields.purchasePrice).toBeNull();
    },
  );
  it("restricts repair context to goods pages and rejects service-page evidence", async () => {
    vi.stubEnv("NVIDIA_LLM_API_KEY", "test-key");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          fields: { purchasePrice: "170.00" },
          evidence: { purchasePrice: "Total 170.00" },
          invoicePages: [2],
        }),
      )
      .mockResolvedValueOnce(
        response({
          fields: { name: "Courier Express" },
          evidence: { name: "Courier Express" },
        }),
      );
    vi.stubGlobal("fetch", fetch);
    const result = await extractBillWithAi(raw, { pages });
    expect(
      JSON.parse(fetch.mock.calls[1]![1].body).messages[1].content,
    ).not.toContain("SHIPPING0001");
    expect(result.fields.name).toBe("");
    expect(result.fields.purchasePrice).toBe("170.00");
  });
});
