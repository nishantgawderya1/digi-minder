export const OCR_MAX_EDGE = 3000;
const MAX_IMAGE_DATA_LENGTH = 2_400_000;

export function ocrImageSize(width: number, height: number) {
  const longest = Math.max(width, height);
  const scale = Math.min(
    2,
    Math.max(1, 1600 / longest),
    OCR_MAX_EDGE / longest,
  );
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function pdfOcrScale(width: number, height: number) {
  return Math.min(300 / 72, OCR_MAX_EDGE / Math.max(width, height));
}

export function encodeOcrImage(canvas: {
  toDataURL: (type: "image/png" | "image/jpeg", quality?: number) => string;
}) {
  // Keep small text lossless when possible; photos fall back to bounded JPEGs.
  const png = canvas.toDataURL("image/png");
  if (png.length <= MAX_IMAGE_DATA_LENGTH) return png;
  for (const quality of [0.94, 0.86, 0.75, 0.6]) {
    const data = canvas.toDataURL("image/jpeg", quality);
    if (data.length <= MAX_IMAGE_DATA_LENGTH) return data;
  }
  throw new Error(
    "This page is too large to read. Try a more tightly cropped image.",
  );
}
