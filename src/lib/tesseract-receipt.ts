import type { ImageLike, Worker } from "tesseract.js";

export async function recognizeReceipt(
  create: () => Promise<Worker>,
  image: ImageLike,
  onRetry?: () => void,
) {
  let worker: Worker | undefined;
  let termination: Promise<unknown> | undefined;
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const terminate = () => {
    if (worker) termination ??= worker.terminate();
    return termination;
  };
  const work = async () => {
    worker = await create();
    if (expired) {
      await terminate();
      throw new Error(
        "Local OCR timed out. Retry or enter the details manually.",
      );
    }
    const { PSM } = await import("tesseract.js");
    const results: { text: string; confidence: number }[] = [];
    for (const mode of [PSM.AUTO, PSM.SPARSE_TEXT]) {
      if (expired) break;
      await worker.setParameters({
        tessedit_pageseg_mode: mode,
        preserve_interword_spaces: "1",
        user_defined_dpi: "300",
        thresholding_method: mode === PSM.AUTO ? "0" : "2",
      });
      const { data } = await worker.recognize(image, { rotateAuto: true });
      const text = data.text.trim().slice(0, 100_000);
      const confidence = Number.isFinite(data.confidence)
        ? Math.max(0, Math.min(1, data.confidence / 100))
        : 0;
      if (text) results.push({ text, confidence });
      if (mode === PSM.AUTO && text.length >= 40 && confidence >= 0.85) break;
      if (mode === PSM.AUTO && !expired) onRetry?.();
    }
    if (!results.length)
      throw new Error(
        "No readable text was found. Try a clearer photo or enter the details manually.",
      );
    // Select a complete reading, never splice conflicting identifiers across passes.
    const score = (result: (typeof results)[number]) =>
      Math.min(result.text.replace(/\s/g, "").length, 600) *
      result.confidence ** 2;
    return results.sort((a, b) => score(b) - score(a))[0]!;
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
    expired = true;
    clearTimeout(timer);
    await terminate();
  }
}
