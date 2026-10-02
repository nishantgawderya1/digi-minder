import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readdir, readFile, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { PDFDocument } from "pdf-lib";
import { parse } from "dotenv";

const root = await realpath(resolve(process.argv[2] || ".output/server"));
const require = createRequire(join(root, "index.mjs"));
async function packaged(name) {
  const path = await realpath(require.resolve(name));
  assert(
    path.startsWith(`${root}/`),
    `${name} is missing from the deployment artifact.`,
  );
  return path;
}
const canvasPath = await packaged("@napi-rs/canvas");
const { createCanvas } = require(canvasPath);
const pdfPath = await packaged("pdfjs-dist/legacy/build/pdf.mjs");
const pdfjs = await import(pathToFileURL(pdfPath).href);
const pdfRoot = resolve(dirname(pdfPath), "../..");
await packaged("pdfjs-dist/legacy/build/pdf.worker.mjs");
const pdf = await PDFDocument.create();
pdf.addPage([500, 700]).drawText("Receipt 001234", { x: 40, y: 600, size: 24 });
const task = pdfjs.getDocument({
  data: await pdf.save(),
  useSystemFonts: false,
  cMapUrl: `${pdfRoot}/cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${pdfRoot}/standard_fonts/`,
  wasmUrl: `${pdfRoot}/wasm/`,
});
try {
  const document = await task.promise;
  const page = await document.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext("2d");
  await page.render({
    canvas,
    canvasContext: ctx,
    viewport,
    background: "white",
  }).promise;
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  assert(
    pixels.some((value, index) => index % 4 !== 3 && value < 100),
    "Packaged PDF rendering is blank.",
  );
} finally {
  await task.destroy();
}
const tessPath = await packaged("tesseract.js");
await packaged("tesseract.js-core/tesseract-core-simd-lstm.wasm");
const { createWorker } = require(tessPath);
let worker;
const timeout = setTimeout(() => {
  void worker?.terminate();
}, 90000);
try {
  worker = await createWorker("eng", 1, { cachePath: tmpdir() });
  const canvas = createCanvas(900, 220);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "black";
  ctx.font = "36px sans-serif";
  ctx.fillText("Serial number: 001234", 40, 70);
  ctx.fillText("Total: INR 170.00", 40, 130);
  const { data } = await worker.recognize(canvas.toBuffer("image/png"));
  assert(
    data.text.includes("001234") && data.text.includes("170.00"),
    "Packaged Tesseract did not recognize the receipt.",
  );
} finally {
  clearTimeout(timeout);
  await worker?.terminate();
}
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...(await files(path)));
    else if (/\.(js|mjs|html|css|json)$/.test(entry.name)) paths.push(path);
  }
  return paths;
}
const env = parse(await readFile(".env", "utf8").catch(() => ""));
const secrets = Object.entries(env)
  .filter(
    ([key, value]) =>
      !key.startsWith("VITE_") &&
      /KEY|SECRET|TOKEN|DATABASE_URL/.test(key) &&
      value.length > 15,
  )
  .map(([, value]) => value);
const publicDir = process.argv[3] || ".output/public";
for (const path of await files(publicDir)) {
  const contents = await readFile(path, "utf8");
  assert(
    !secrets.some((value) => contents.includes(value)),
    "A server credential appeared in the public build.",
  );
}
console.log(
  "Verified packaged PDF rendering, native canvas, Tesseract recognition and public credential isolation.",
);
