import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  evaluateExtraction,
  readOcrProvider,
  scoreFields,
} from "../scripts/evaluate-extraction.mjs";

const temporaryDirectories: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  for (const directory of temporaryDirectories.splice(0)) {
    expect(directory.startsWith(join(tmpdir(), "warrantly-eval-"))).toBe(true);
    await rm(directory, { recursive: true, force: true });
  }
});

function readers() {
  return {
    hasNvidiaKey: true,
    runOcr: vi.fn().mockResolvedValue({
      text: "Product\tQty\tAmount\nAcme Lamp\t1\t125.00",
      confidence: 0.99,
    }),
    readWithServerTesseract: vi.fn().mockResolvedValue({
      text: "Local OCR",
      confidence: 90,
    }),
  };
}

describe("production OCR selection in the private receipt evaluator", () => {
  it("preserves NVIDIA's reconstructed columns without invoking local OCR", async () => {
    const dependencies = readers();
    const result = await readOcrProvider("data:image/jpeg;base64,YQ==", {
      ...dependencies,
      provider: "auto",
    });
    expect(result).toEqual({
      text: "Product\tQty\tAmount\nAcme Lamp\t1\t125.00",
      source: "nvidia",
      nvidiaAttempts: 1,
      tesseractAttempts: 0,
      fallback: false,
    });
    expect(dependencies.readWithServerTesseract).not.toHaveBeenCalled();
  });

  it("uses the production local fallback after NVIDIA rejects a page", async () => {
    const dependencies = readers();
    dependencies.runOcr.mockRejectedValue(new Error("low confidence"));
    expect(
      await readOcrProvider("data:image/jpeg;base64,YQ==", {
        ...dependencies,
        provider: "auto",
      }),
    ).toMatchObject({
      source: "tesseract",
      nvidiaAttempts: 1,
      tesseractAttempts: 1,
      fallback: true,
    });
    expect(dependencies.readWithServerTesseract).toHaveBeenCalledWith(
      Buffer.from("a"),
    );
  });

  it("reports an unavailable OCR key without silently substituting a provider in explicit NVIDIA mode", async () => {
    const dependencies = readers();
    await expect(
      readOcrProvider("data:image/jpeg;base64,YQ==", {
        ...dependencies,
        provider: "nvidia",
        hasNvidiaKey: false,
      }),
    ).rejects.toThrow("NVIDIA_NEMOTRON_OCR_API_KEY is not configured");
    expect(dependencies.runOcr).not.toHaveBeenCalled();
    expect(dependencies.readWithServerTesseract).not.toHaveBeenCalled();
    expect(
      await readOcrProvider("data:image/jpeg;base64,YQ==", {
        ...dependencies,
        provider: "auto",
        hasNvidiaKey: false,
      }),
    ).toMatchObject({
      source: "tesseract",
      nvidiaAttempts: 0,
      fallback: false,
    });
  });

  it("does not hide a failed explicit NVIDIA run behind Tesseract", async () => {
    const dependencies = readers();
    dependencies.runOcr.mockRejectedValue(new Error("private provider body"));
    await expect(
      readOcrProvider("data:image/jpeg;base64,YQ==", {
        ...dependencies,
        provider: "nvidia",
      }),
    ).rejects.toThrow("NVIDIA OCR failed. No fallback was used");
    expect(dependencies.readWithServerTesseract).not.toHaveBeenCalled();
  });

  it("permits a reproducible local OCR comparison without an NVIDIA OCR request", async () => {
    const dependencies = readers();
    expect(
      await readOcrProvider("data:image/jpeg;base64,YQ==", {
        ...dependencies,
        provider: "tesseract",
      }),
    ).toMatchObject({
      source: "tesseract",
      nvidiaAttempts: 0,
      fallback: false,
    });
    expect(dependencies.runOcr).not.toHaveBeenCalled();
  });
});

it("distinguishes wrong populated values from omissions and never passes labels as AI", () => {
  const result = scoreFields(
    { brand: "Acme", purchasePrice: "125.00", purchaseDate: "2026-10-01" },
    { brand: "Wrong seller", purchasePrice: null, purchaseDate: "2026-10-01" },
    "nvidia-llm",
  );
  expect(result.outcomes).toMatchObject({
    brand: { matched: false, wrongAutofill: true, omission: false },
    purchasePrice: { matched: false, wrongAutofill: false, omission: true },
    purchaseDate: { matched: true, wrongAutofill: false, omission: false },
  });
  expect(
    scoreFields({ brand: null }, { brand: "Acme" }, "nvidia-llm"),
  ).toMatchObject({ outcomes: { brand: { wrongAutofill: true } } });
  expect(
    scoreFields({ brand: "Acme" }, { brand: "Acme" }, "labels").passed,
  ).toBe(false);
});

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "warrantly-eval-"));
  temporaryDirectories.push(directory);
  await writeFile(join(directory, "private-photo.jpg"), "image bytes");
  const manifest = join(directory, "private-manifest.json");
  await writeFile(
    manifest,
    JSON.stringify({
      cases: [
        {
          id: "receipt-1",
          file: "private-photo.jpg",
          expected: {
            brand: "PrivateBrand",
            purchasePrice: "12345.67",
            purchaseDate: "2026-01-28",
          },
        },
      ],
    }),
  );
  return { directory, manifest, output: join(directory, "safe-report.json") };
}

function modules(
  extractBillWithAi: ReturnType<typeof vi.fn>,
  key: string | null = "test-key",
) {
  const prepareServerPage = vi.fn().mockResolvedValue({
    text: null,
    imageDataUrl: "data:image/jpeg;base64,YQ==",
  });
  const runOcr = vi.fn().mockResolvedValue({
    text: "PrivateBrand\t12345.67\nPrivate customer details",
  });
  const close = vi.fn();
  const source = {
    "/src/lib/nvidia-config.server.ts": {
      nvidiaLlmConfig: () => ({ key, endpoint: "https://test.invalid/llm" }),
    },
    "/src/lib/bill-extraction.server.ts": { extractBillWithAi },
    "/src/lib/document-render.server.ts": { prepareServerPage },
    "/src/lib/tesseract.server.ts": { readWithServerTesseract: vi.fn() },
    "/src/lib/ocr.server.ts": { runOcr },
    "/src/lib/bills.ts": {
      MAX_FILE_BYTES: 1000,
      MAX_PAGES: 10,
      billFieldsSchema: {
        shape: { brand: {}, purchasePrice: {}, purchaseDate: {} },
      },
    },
  };
  return {
    prepareServerPage,
    runOcr,
    close,
    createServer: vi.fn(async () => ({
      close,
      ssrLoadModule: async (name: keyof typeof source) => source[name],
    })),
  };
}

function extracted(method = "nvidia-llm") {
  return {
    fields: {
      brand: "PrivateBrand",
      purchasePrice: "12345.67",
      purchaseDate: "2026-01-28",
    },
    method,
    warning: "private warning with data must not appear",
    diagnostics: { repairedName: false, reasoningUsed: false },
  };
}

it("runs prepared photos through NVIDIA once, preserves columns, and writes only safe comparison outcomes", async () => {
  vi.stubEnv("NVIDIA_NEMOTRON_OCR_API_KEY", "test-only-ocr-key");
  const files = await fixture();
  const fetch = vi.fn().mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  fields: { name: "PrivateBrand" },
                  evidence: { name: "Private customer details" },
                }),
              },
            },
          ],
        }),
      ),
  );
  vi.stubGlobal("fetch", fetch);
  const extract = vi.fn().mockImplementation(async (_raw, options) => {
    await globalThis.fetch("https://test.invalid/llm");
    if (!options.skipNameRepair)
      await globalThis.fetch("https://test.invalid/llm");
    return extracted();
  });
  const dependencies = modules(extract);
  const log = vi.fn();
  const report = await evaluateExtraction(
    [
      "--manifest",
      files.manifest,
      "--output",
      files.output,
      "--ocr-provider",
      "auto",
      "--force-name-repair",
      "--compare-thinking",
    ],
    { ...dependencies, log },
  );
  expect(dependencies.prepareServerPage).toHaveBeenCalledTimes(1);
  expect(dependencies.runOcr).toHaveBeenCalledTimes(1);
  expect(extract).toHaveBeenCalledTimes(3);
  expect(extract.mock.calls[0][1].pages[0].text).toBe(
    "PrivateBrand\t12345.67\nPrivate customer details",
  );
  expect(report).toMatchObject({
    baselineProviderCalls: 1,
    totalLlmProviderCalls: 3,
    modelRequestBudgetPerExtraction: 2,
    ocr: {
      nvidiaAttempts: 1,
      tesseractAttempts: 0,
      sourcePages: { nvidia: 1 },
    },
    summary: {
      "repair-standard": {
        passed: 1,
        providerCalls: 1,
        replayedBaselineResponses: 1,
      },
      "repair-thinking": {
        passed: 1,
        providerCalls: 1,
        replayedBaselineResponses: 1,
      },
    },
  });
  const serialized = await readFile(files.output, "utf8");
  expect(JSON.parse(serialized)).toEqual(report);
  for (const value of [
    "PrivateBrand",
    "Private customer details",
    "12345.67",
    "2026-01-28",
    "test-only-ocr-key",
    "private-photo",
    "private warning",
    files.directory,
  ]) {
    expect(serialized).not.toContain(value);
    expect(JSON.stringify(log.mock.calls)).not.toContain(value);
  }
  expect(dependencies.close).toHaveBeenCalledOnce();
  expect(globalThis.fetch).toBe(fetch);
});

it("refuses a fake AI benchmark with no model key before rendering any photo", async () => {
  const files = await fixture();
  const dependencies = modules(vi.fn(), null);
  await expect(
    evaluateExtraction(["--manifest", files.manifest], dependencies),
  ).rejects.toThrow("Labels are not an AI benchmark");
  expect(dependencies.prepareServerPage).not.toHaveBeenCalled();
  expect(dependencies.close).toHaveBeenCalledOnce();
});

it("keeps label fallback visible in the summary even if its field values match", async () => {
  vi.stubEnv("NVIDIA_NEMOTRON_OCR_API_KEY", "test-only-ocr-key");
  const files = await fixture();
  const dependencies = modules(vi.fn().mockResolvedValue(extracted("labels")));
  const report = await evaluateExtraction(["--manifest", files.manifest], {
    ...dependencies,
    log: vi.fn(),
  });
  expect(report.summary["repair-standard"]).toMatchObject({
    cases: 1,
    passed: 0,
    aiCases: 0,
    labelFallbackCases: 1,
    fieldOutcomes: {
      brand: { checked: 1, matched: 1, wrongAutofills: 0, omissions: 0 },
    },
  });
});

it("bounds live model requests and restores fetch and server resources on failure", async () => {
  vi.stubEnv("NVIDIA_NEMOTRON_OCR_API_KEY", "test-only-ocr-key");
  const files = await fixture();
  const fetch = vi.fn().mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetch);
  const dependencies = modules(
    vi.fn(async () => {
      await globalThis.fetch("https://test.invalid/llm");
      await globalThis.fetch("https://test.invalid/llm");
      await globalThis.fetch("https://test.invalid/llm");
      return extracted();
    }),
  );
  await expect(
    evaluateExtraction(["--manifest", files.manifest], {
      ...dependencies,
      log: vi.fn(),
    }),
  ).rejects.toThrow("model request budget exceeded");
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(globalThis.fetch).toBe(fetch);
  expect(dependencies.close).toHaveBeenCalledOnce();
});
