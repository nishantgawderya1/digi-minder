import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { MAX_PAGES } from "./bills";
import { encodeOcrImage, ocrImageSize, pdfOcrScale } from "./ocr-image";

export async function prepareServerPage(
  bytes: Uint8Array,
  contentType: string,
  index: number,
  options: { forceRaster?: boolean } = {},
) {
  if (contentType !== "application/pdf") {
    if (index !== 0) throw new Error("Invalid image page.");
    const image = await loadImage(Buffer.from(bytes));
    if (image.width * image.height > 60_000_000)
      throw new Error("Image exceeds the pixel limit.");
    const size = ocrImageSize(image.width, image.height);
    const canvas = createCanvas(size.width, size.height);
    const context = canvas.getContext("2d");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { text: null, imageDataUrl: encodeOcrImage(canvas) };
  }
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const root = join(
    dirname(
      createRequire(import.meta.url).resolve("pdfjs-dist/legacy/build/pdf.mjs"),
    ),
    "../..",
  );
  const task = pdfjs.getDocument({
    data: bytes,
    useSystemFonts: false,
    cMapUrl: `${root}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${root}/standard_fonts/`,
    wasmUrl: `${root}/wasm/`,
  });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > MAX_PAGES || index >= pdf.numPages)
      throw new Error("Invalid PDF page count.");
    const page = await pdf.getPage(index + 1);
    const content = await page.getTextContent();
    const text = content.items
      .flatMap((item) =>
        "str" in item ? [item.str + (item.hasEOL ? "\n" : " ")] : [],
      )
      .join("")
      .trim();
    if (
      !options.forceRaster &&
      text.length >= 100 &&
      /\p{L}/u.test(text) &&
      !text.includes("\uFFFD")
    )
      return { text: text.slice(0, 100_000), imageDataUrl: null };
    const original = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({
      scale: pdfOcrScale(original.width, original.height),
    });
    const canvas = createCanvas(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height),
    );
    await page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: canvas.getContext(
        "2d",
      ) as unknown as CanvasRenderingContext2D,
      viewport,
      background: "white",
    }).promise;
    return { text: null, imageDataUrl: encodeOcrImage(canvas) };
  } finally {
    await task.destroy();
  }
}
