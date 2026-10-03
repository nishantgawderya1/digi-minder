import { recognizeReceipt } from "./tesseract-receipt";

export async function readWithTesseract(
  imageDataUrl: string,
  onProgress: (message: string) => void,
) {
  let active = true;
  try {
    return await recognizeReceipt(
      async () => {
        const { createWorker } = await import("tesseract.js");
        const { default: workerPath } =
          await import("tesseract.js/dist/worker.min.js?url");
        return createWorker("eng", 1, {
          workerPath,
          logger: (message) => {
            if (active && message.status === "recognizing text")
              onProgress(
                `Reading locally: ${Math.round(message.progress * 100)}%`,
              );
          },
          errorHandler: () => {},
        });
      },
      imageDataUrl,
      () => onProgress("Improving local text recognition"),
    );
  } finally {
    active = false;
  }
}
