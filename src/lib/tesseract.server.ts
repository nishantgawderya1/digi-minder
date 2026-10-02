import { createWorker, PSM, type Worker } from "tesseract.js";

export async function readWithServerTesseract(image: Uint8Array) {
  let worker: Worker | undefined;
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = async () => {
    worker = await createWorker("eng", 1, {
      cachePath: process.env["TMPDIR"] || "/tmp",
    });
    if (expired) {
      await worker.terminate();
      throw new Error("Local OCR timed out.");
    }
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: "1",
    });
    const result = await worker.recognize(Buffer.from(image));
    if (!result.data.text.trim())
      throw new Error("No readable text was found.");
    return {
      text: result.data.text.slice(0, 100_000),
      confidence: Math.max(0, Math.min(1, result.data.confidence / 100)),
    };
  };
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          expired = true;
          reject(new Error("Local OCR timed out."));
        }, 90000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    await worker?.terminate();
  }
}
