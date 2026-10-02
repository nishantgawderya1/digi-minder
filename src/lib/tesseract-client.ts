import type { Worker } from "tesseract.js";

export async function readWithTesseract(
  imageDataUrl: string,
  onProgress: (message: string) => void,
) {
  let worker: Worker | undefined;
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = async () => {
    const { createWorker, PSM } = await import("tesseract.js");
    const { default: workerPath } =
      await import("tesseract.js/dist/worker.min.js?url");
    worker = await createWorker("eng", 1, {
      workerPath,
      logger: (message) => {
        if (!expired && message.status === "recognizing text")
          onProgress(`Reading locally: ${Math.round(message.progress * 100)}%`);
      },
      errorHandler: () => {},
    });
    if (expired) {
      await worker.terminate();
      throw new Error("Local OCR timed out.");
    }
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: "1",
    });
    const { data } = await worker.recognize(imageDataUrl);
    if (!data.text.trim())
      throw new Error(
        "No readable text was found. Try a clearer photo or enter the details manually.",
      );
    return {
      text: data.text.slice(0, 100_000),
      confidence: Math.max(0, Math.min(1, data.confidence / 100)),
    };
  };
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          expired = true;
          reject(
            new Error(
              "Local OCR timed out. Retry or enter the details manually.",
            ),
          );
        }, 90_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    expired = true;
    await worker?.terminate();
  }
}
