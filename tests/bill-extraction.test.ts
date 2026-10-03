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
      documentText: text,
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
