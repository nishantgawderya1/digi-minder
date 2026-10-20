import { readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { performance } from "node:perf_hooks";
import { config } from "dotenv";
import { createServer } from "vite";
import { z } from "zod";

class EvaluationError extends Error {}
const focusFields = ["brand", "purchasePrice", "purchaseDate"];
const manifestSchema = z.object({
  cases: z
    .array(
      z
        .object({
          id: z.string().regex(/^[a-z0-9_-]{1,80}$/i),
          text: z.string().max(60_000).optional(),
          pages: z
            .array(
              z.object({
                page: z.number().int().min(1).max(10),
                text: z.string().max(60_000),
              }),
            )
            .max(10)
            .optional(),
          file: z.string().optional(),
          raster: z.boolean().default(false),
          expected: z.record(
            z.union([z.string().max(4000), z.number(), z.null()]),
          ),
        })
        .refine(
          (item) =>
            [item.text, item.pages, item.file].filter(
              (value) => value !== undefined,
            ).length === 1,
          "Provide exactly one source.",
        ),
    )
    .min(1)
    .max(12),
});

// These outcomes contain neither expected values nor predictions.
// A label fallback cannot be mistaken for successful AI extraction.
export function scoreFields(expected, fields, method) {
  const outcomes = Object.fromEntries(
    Object.entries(expected).map(([field, wanted]) => {
      const actual = fields[field];
      const empty = actual === null || actual === undefined || actual === "";
      const wantedEmpty = wanted === null || wanted === "";
      return [
        field,
        {
          matched: actual === wanted,
          wrongAutofill: actual !== wanted && !empty,
          omission: actual !== wanted && empty && !wantedEmpty,
          expectedBlank: wantedEmpty,
        },
      ];
    }),
  );
  const matches = Object.fromEntries(
    Object.entries(outcomes).map(([field, outcome]) => [
      field,
      outcome.matched,
    ]),
  );
  return {
    matches,
    outcomes,
    passed: method === "nvidia-llm" && Object.values(matches).every(Boolean),
  };
}

// runOcr reconstructs the production NVIDIA spatial rows and columns.
// Never flatten or re-sort that returned text in the evaluator.
export async function readOcrProvider(
  imageDataUrl,
  { provider, hasNvidiaKey, runOcr, readWithServerTesseract },
) {
  if (provider === "nvidia" && !hasNvidiaKey)
    throw new EvaluationError(
      "NVIDIA OCR was selected but NVIDIA_NEMOTRON_OCR_API_KEY is not configured.",
    );
  let attemptedNvidia = false;
  if (provider !== "tesseract" && hasNvidiaKey) {
    attemptedNvidia = true;
    try {
      const result = await runOcr(imageDataUrl);
      return {
        text: result.text,
        source: "nvidia",
        nvidiaAttempts: 1,
        tesseractAttempts: 0,
        fallback: false,
      };
    } catch {
      if (provider === "nvidia")
        throw new EvaluationError(
          "NVIDIA OCR failed. No fallback was used because --ocr-provider nvidia was selected.",
        );
    }
  }
  const result = await readWithServerTesseract(
    Buffer.from(imageDataUrl.split(",")[1], "base64"),
  );
  return {
    text: result.text,
    source: "tesseract",
    nvidiaAttempts: Number(attemptedNvidia),
    tesseractAttempts: 1,
    fallback: attemptedNvidia,
  };
}

export async function evaluateExtraction(
  args = process.argv.slice(2),
  dependencies = {},
) {
  const { values } = parseArgs({
    args,
    options: {
      manifest: {
        type: "string",
        default: "tests/fixtures/extraction-cases.json",
      },
      "compare-thinking": { type: "boolean", default: false },
      "force-name-repair": { type: "boolean", default: false },
      "ocr-provider": { type: "string", default: "auto" },
      output: { type: "string" },
      case: { type: "string" },
    },
  });
  const ocrProvider = values["ocr-provider"];
  if (!["auto", "nvidia", "tesseract"].includes(ocrProvider))
    throw new EvaluationError(
      "--ocr-provider must be auto, nvidia or tesseract.",
    );
  config({ quiet: true });
  const manifestPath = resolve(values.manifest);
  const manifest = manifestSchema.parse(
    JSON.parse(await readFile(manifestPath, "utf8")),
  );
  const cases = values.case
    ? manifest.cases.filter((item) => item.id === values.case)
    : manifest.cases;
  if (!cases.length) throw new EvaluationError("No matching evaluation case.");
  const server = await (dependencies.createServer ?? createServer)({
    configFile: false,
    appType: "custom",
    server: { middlewareMode: true, hmr: false, ws: false },
  });
  const log = dependencies.log ?? console.log;
  const originalFetch = globalThis.fetch;
  try {
    const { nvidiaLlmConfig } = await server.ssrLoadModule(
      "/src/lib/nvidia-config.server.ts",
    );
    const { key, endpoint } = nvidiaLlmConfig();
    if (!key)
      throw new EvaluationError(
        "Configure the server NVIDIA LLM key before running a live evaluation. Labels are not an AI benchmark.",
      );
    const { extractBillWithAi } = await server.ssrLoadModule(
      "/src/lib/bill-extraction.server.ts",
    );
    const { prepareServerPage } = await server.ssrLoadModule(
      "/src/lib/document-render.server.ts",
    );
    const { readWithServerTesseract } = await server.ssrLoadModule(
      "/src/lib/tesseract.server.ts",
    );
    const { runOcr } = await server.ssrLoadModule("/src/lib/ocr.server.ts");
    const { MAX_FILE_BYTES, MAX_PAGES, billFieldsSchema } =
      await server.ssrLoadModule("/src/lib/bills.ts");
    const totals = {};
    const results = [];
    const ocr = {
      selectedProvider: ocrProvider,
      nvidiaAttempts: 0,
      tesseractAttempts: 0,
      fallbacks: 0,
      sourcePages: { text: 0, "pdf-text": 0, nvidia: 0, tesseract: 0 },
    };
    let baselineProviderCalls = 0;
    let baselineMilliseconds = 0;
    for (const item of cases) {
      for (const field of Object.keys(item.expected))
        if (!(field in billFieldsSchema.shape))
          throw new EvaluationError("Unknown expected field.");
      const ocrStarted = performance.now();
      let pages =
        item.pages ??
        (item.text !== undefined ? [{ page: 1, text: item.text }] : null);
      const caseSources = [];
      if (pages) {
        ocr.sourcePages.text += pages.length;
        caseSources.push(...pages.map(() => "text"));
      } else {
        const path = resolve(dirname(manifestPath), item.file);
        const bytes = new Uint8Array(await readFile(path));
        if (!bytes.length || bytes.length > MAX_FILE_BYTES)
          throw new EvaluationError("Evaluation file exceeds upload limits.");
        const type = {
          ".pdf": "application/pdf",
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".webp": "image/webp",
        }[extname(path).toLowerCase()];
        if (!type)
          throw new EvaluationError("Unsupported evaluation file type.");
        let count = 1;
        if (type === "application/pdf") {
          const { PDFDocument } = await import("pdf-lib");
          count = (await PDFDocument.load(bytes)).getPageCount();
        }
        if (count > MAX_PAGES)
          throw new EvaluationError("Evaluation PDF exceeds page limits.");
        pages = [];
        for (let page = 0; page < count; page++) {
          const prepared = await prepareServerPage(bytes.slice(), type, page, {
            forceRaster: item.raster,
          });
          let text = prepared.text;
          let source = "pdf-text";
          if (!text) {
            if (
              !prepared.imageDataUrl ||
              prepared.imageDataUrl.length > 2_500_000
            )
              throw new EvaluationError(
                "Page image exceeds the production OCR limit.",
              );
            const read = await readOcrProvider(prepared.imageDataUrl, {
              provider: ocrProvider,
              hasNvidiaKey:
                !!process.env["NVIDIA_NEMOTRON_OCR_API_KEY"]?.trim(),
              runOcr,
              readWithServerTesseract,
            });
            text = read.text;
            source = read.source;
            ocr.nvidiaAttempts += read.nvidiaAttempts;
            ocr.tesseractAttempts += read.tesseractAttempts;
            ocr.fallbacks += Number(read.fallback);
          }
          ocr.sourcePages[source]++;
          caseSources.push(source);
          pages.push({ page: page + 1, text });
        }
      }
      const ocrMilliseconds = Math.round(performance.now() - ocrStarted);
      const raw = pages
        .map((page) => "[Page " + page.page + "]\n" + page.text)
        .join("\n\n");
      // Forced repair replays a real baseline. Count baseline and replay calls
      // separately so comparison mode cannot hide additional paid requests.
      let baseline;
      if (values["force-name-repair"]) {
        let caseCalls = 0;
        globalThis.fetch = async (...fetchArgs) => {
          if (fetchArgs[0] === endpoint) {
            if (++caseCalls > 2)
              throw new EvaluationError(
                "Per-extraction model request budget exceeded.",
              );
            baselineProviderCalls++;
          }
          const response = await originalFetch(...fetchArgs);
          if (fetchArgs[0] === endpoint && response.ok)
            baseline ??= await response.clone().json();
          return response;
        };
        const start = performance.now();
        try {
          await extractBillWithAi(raw, { pages, skipNameRepair: true });
        } finally {
          baselineMilliseconds += Math.round(performance.now() - start);
          globalThis.fetch = originalFetch;
        }
        const content = baseline?.choices?.[0]?.message?.content;
        if (
          typeof content !== "string" ||
          baseline.choices[0].finish_reason !== "stop"
        )
          throw new EvaluationError(
            "Baseline evaluation did not return valid JSON.",
          );
        const candidate = z
          .object({
            fields: z.record(z.unknown()),
            evidence: z.record(z.unknown()),
          })
          .passthrough()
          .parse(JSON.parse(content));
        candidate.fields.name = null;
        delete candidate.nameStatus;
        baseline.choices[0].message.content = JSON.stringify(candidate);
      }
      for (const thinking of values["compare-thinking"]
        ? [false, true]
        : [false]) {
        const mode = thinking ? "repair-thinking" : "repair-standard";
        let replayed = false;
        let providerCalls = 0;
        let extractionRequests = 0;
        globalThis.fetch = async (...fetchArgs) => {
          if (fetchArgs[0] === endpoint) {
            if (++extractionRequests > 2)
              throw new EvaluationError(
                "Per-extraction model request budget exceeded.",
              );
            if (baseline && !replayed) {
              replayed = true;
              return new Response(JSON.stringify(baseline), {
                headers: { "Content-Type": "application/json" },
              });
            }
            providerCalls++;
          }
          return originalFetch(...fetchArgs);
        };
        const start = performance.now();
        let result;
        try {
          result = await extractBillWithAi(raw, {
            pages,
            repairThinking: thinking,
          });
        } finally {
          globalThis.fetch = originalFetch;
        }
        const { matches, outcomes, passed } = scoreFields(
          item.expected,
          result.fields,
          result.method,
        );
        const total = (totals[mode] ??= {
          cases: 0,
          passed: 0,
          aiCases: 0,
          labelFallbackCases: 0,
          providerCalls: 0,
          replayedBaselineResponses: 0,
          milliseconds: 0,
          reasoningCases: 0,
          matchedFields: {},
          fieldOutcomes: {},
          falseNameAutofills: 0,
          nameCoverage: 0,
        });
        total.cases++;
        total.passed += Number(passed);
        total.aiCases += Number(result.method === "nvidia-llm");
        total.labelFallbackCases += Number(result.method !== "nvidia-llm");
        total.providerCalls += providerCalls;
        total.replayedBaselineResponses += Number(replayed);
        total.milliseconds += Math.round(performance.now() - start);
        total.reasoningCases += Number(result.diagnostics.reasoningUsed);
        for (const [field, outcome] of Object.entries(outcomes)) {
          total.matchedFields[field] =
            (total.matchedFields[field] ?? 0) + Number(outcome.matched);
          const counts = (total.fieldOutcomes[field] ??= {
            checked: 0,
            matched: 0,
            wrongAutofills: 0,
            omissions: 0,
            expectedBlank: 0,
          });
          counts.checked++;
          counts.matched += Number(outcome.matched);
          counts.wrongAutofills += Number(outcome.wrongAutofill);
          counts.omissions += Number(outcome.omission);
          counts.expectedBlank += Number(outcome.expectedBlank);
        }
        total.falseNameAutofills += Number(
          item.expected.name === "" && !!result.fields.name,
        );
        total.nameCoverage += Number(!!result.fields.name);
        const outcome = {
          id: item.id,
          mode,
          passed,
          matches,
          focusFields: Object.fromEntries(
            focusFields
              .filter((field) => outcomes[field])
              .map((field) => [field, outcomes[field]]),
          ),
          repairedName: result.diagnostics.repairedName,
          method: result.method,
          providerCalls,
          replayedBaseline: replayed,
          ocrSources: caseSources,
          ocrMilliseconds,
        };
        results.push(outcome);
        log(JSON.stringify(outcome));
      }
    }
    const report = {
      version: 1,
      cases: results,
      summary: totals,
      ocr,
      forcedRepairBenchmark: values["force-name-repair"],
      baselineProviderCalls,
      baselineMilliseconds,
      totalLlmProviderCalls:
        baselineProviderCalls +
        Object.values(totals).reduce(
          (sum, total) => sum + total.providerCalls,
          0,
        ),
      modelRequestBudgetPerExtraction: 2,
      note: "Small samples do not establish production accuracy. OCR is shared between comparison modes; baseline calls are additional and reported separately. Field matches include label fallbacks, but only NVIDIA extraction cases can pass. Reports omit receipt text, expected values, predictions, quotes, paths and credentials.",
    };
    log(JSON.stringify({ ...report, cases: undefined }));
    if (values.output)
      await writeFile(
        resolve(values.output),
        JSON.stringify(report, null, 2) + "\n",
        { encoding: "utf8", mode: 0o600 },
      );
    return report;
  } finally {
    globalThis.fetch = originalFetch;
    await server.close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    await evaluateExtraction();
  } catch (error) {
    console.error(
      error instanceof EvaluationError
        ? error.message
        : "Evaluation failed. Check the private manifest and provider setup; no source contents were logged.",
    );
    process.exitCode = 1;
  }
}
