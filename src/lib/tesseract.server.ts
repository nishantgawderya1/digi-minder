import { createWorker } from "tesseract.js";
import { recognizeReceipt } from "./tesseract-receipt";

export async function readWithServerTesseract(image: Uint8Array) {
  return recognizeReceipt(
    () =>
      createWorker("eng", 1, { cachePath: process.env["TMPDIR"] || "/tmp" }),
    Buffer.from(image),
  );
}
