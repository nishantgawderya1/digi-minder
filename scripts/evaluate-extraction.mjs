import { readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { performance } from "node:perf_hooks";
import { config } from "dotenv";
import { createServer } from "vite";
import { z } from "zod";

const { values } = parseArgs({
  options: {
    manifest: {
      type: "string",
      default: "tests/fixtures/extraction-cases.json",
    },
    "compare-thinking": { type: "boolean", default: false },
    "force-name-repair": { type: "boolean", default: false },
    case: { type: "string" },
  },
});
config({ quiet: true });
const manifestPath = resolve(values.manifest);
const schema = z.object({
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
          expected: z.record(z.union([z.string(), z.number(), z.null()])),
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
const manifest = schema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
const server = await createServer({
  configFile: false,
  appType: "custom",
  server: { middlewareMode: true, hmr: false, ws: false },
});
try {
  const { nvidiaLlmConfig } = await server.ssrLoadModule(
    "/src/lib/nvidia-config.server.ts",
  );
  if (!nvidiaLlmConfig().key)
    throw new Error(
      "Configure the server NVIDIA key before running a live evaluation.",
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
  const { MAX_FILE_BYTES, MAX_PAGES, billFieldsSchema } =
    await server.ssrLoadModule("/src/lib/bills.ts");
  const originalFetch = globalThis.fetch;
  const totals = {};
  let baselineProviderCalls = 0;
  const cases = values.case
    ? manifest.cases.filter((item) => item.id === values.case)
    : manifest.cases;
  if (!cases.length) throw new Error("No matching evaluation case.");
  for (const item of cases) {
    for (const key of Object.keys(item.expected))
      if (!(key in billFieldsSchema.shape))
        throw new Error("Unknown expected field.");
    let pages =
      item.pages ??
      (item.text !== undefined ? [{ page: 1, text: item.text }] : null);
    if (!pages) {
      const path = resolve(dirname(manifestPath), item.file);
      const bytes = new Uint8Array(await readFile(path));
      if (!bytes.length || bytes.length > MAX_FILE_BYTES)
        throw new Error("Evaluation file exceeds upload limits.");
      const type = {
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
      }[extname(path).toLowerCase()];
      if (!type) throw new Error("Unsupported evaluation file type.");
      let count = 1;
      if (type === "application/pdf") {
        const { PDFDocument } = await import("pdf-lib");
        count = (await PDFDocument.load(bytes)).getPageCount();
      }
      if (count > MAX_PAGES)
        throw new Error("Evaluation PDF exceeds page limits.");
      pages = [];
      for (let page = 0; page < count; page++) {
        const prepared = await prepareServerPage(bytes.slice(), type, page, {
          forceRaster: item.raster,
        });
        const text =
          prepared.text ??
          (
            await readWithServerTesseract(
              Buffer.from(prepared.imageDataUrl.split(",")[1], "base64"),
            )
          ).text;
        pages.push({ page: page + 1, text });
      }
    }
    const raw = pages
      .map((page) => `[Page ${page.page}]\n${page.text}`)
      .join("\n\n");
    // Replay one real baseline with its name removed to compare repair modes on identical input.
    // The benchmark counts real calls but never writes app data or logs source text/credentials.
    let baseline;
    if (values["force-name-repair"]) {
      const { endpoint } = nvidiaLlmConfig();
      const capture = async (...args) => {
        if (args[0] === endpoint) baselineProviderCalls++;
        const response = await originalFetch(...args);
        if (args[0] === endpoint && response.ok)
          baseline ??= await response.clone().json();
        return response;
      };
      globalThis.fetch = capture;
      try {
        await extractBillWithAi(raw, { pages, skipNameRepair: true });
      } finally {
        globalThis.fetch = originalFetch;
      }
      const content = baseline?.choices?.[0]?.message?.content;
      if (
        typeof content !== "string" ||
        baseline.choices[0].finish_reason !== "stop"
      )
        throw new Error("Baseline evaluation did not return valid JSON.");
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
      globalThis.fetch = async (...args) => {
        if (args[0] === nvidiaLlmConfig().endpoint) {
          if (baseline && !replayed) {
            replayed = true;
            return new Response(JSON.stringify(baseline), {
              headers: { "Content-Type": "application/json" },
            });
          }
          providerCalls++;
        }
        return originalFetch(...args);
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
      const matches = Object.fromEntries(
        Object.entries(item.expected).map(([key, expected]) => [
          key,
          result.fields[key] === expected,
        ]),
      );
      const passed =
        result.method === "nvidia-llm" && Object.values(matches).every(Boolean);
      const total = (totals[mode] ??= {
        cases: 0,
        passed: 0,
        providerCalls: 0,
        milliseconds: 0,
        reasoningCases: 0,
        matchedFields: {},
        falseNameAutofills: 0,
        nameCoverage: 0,
      });
      total.cases++;
      total.passed += Number(passed);
      total.providerCalls += providerCalls;
      total.milliseconds += Math.round(performance.now() - start);
      total.reasoningCases += Number(result.diagnostics.reasoningUsed);
      for (const [field, matched] of Object.entries(matches))
        total.matchedFields[field] =
          (total.matchedFields[field] ?? 0) + Number(matched);
      total.falseNameAutofills += Number(
        item.expected.name === "" && !!result.fields.name,
      );
      total.nameCoverage += Number(!!result.fields.name);
      console.log(
        JSON.stringify({
          id: item.id,
          mode,
          passed,
          matches,
          repairedName: result.diagnostics.repairedName,
          method: result.method,
          warning: result.warning,
        }),
      );
    }
  }
  console.log(
    JSON.stringify({
      summary: totals,
      forcedRepairBenchmark: values["force-name-repair"],
      baselineProviderCalls,
      note: "Synthetic fixtures and small samples do not establish production accuracy. Baseline calls are reported separately from per-mode calls.",
    }),
  );
} finally {
  await server.close();
}
