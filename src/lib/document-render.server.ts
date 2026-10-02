import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { MAX_PAGES } from "./bills";

export async function prepareServerPage(
  bytes: Uint8Array,
  contentType: string,
  index: number,
) {
  if (contentType !== "application/pdf") {
    if (index !== 0) throw new Error("Invalid image page.");
    const image = await loadImage(Buffer.from(bytes));
    if (image.width * image.height > 60_000_000)
      throw new Error("Image exceeds the pixel limit.");
    const scale = Math.min(1, 2200 / Math.max(image.width, image.height));
    const canvas = createCanvas(
      Math.max(1, Math.round(image.width * scale)),
      Math.max(1, Math.round(image.height * scale)),
    );
    const context = canvas.getContext("2d");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { text: null, imageDataUrl: canvas.toDataURL("image/jpeg", 0.85) };
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
    if (text.length >= 100 && /\p{L}/u.test(text) && !text.includes("\uFFFD"))
      return { text: text.slice(0, 100_000), imageDataUrl: null };
    const original = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({
      scale: Math.min(2.5, 2200 / Math.max(original.width, original.height)),
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
    return { text: null, imageDataUrl: canvas.toDataURL("image/jpeg", 0.85) };
  } finally {
    await task.destroy();
  }
}
