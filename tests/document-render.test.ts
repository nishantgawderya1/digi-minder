import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { prepareServerPage } from "@/lib/document-render.server";

describe("Server document rendering", () => {
  it("preserves exact digital PDF identifiers without OCR", async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const page = pdf.addPage([500, 700]);
    [
      "Product name: Test lamp",
      "Serial number: 00001002",
      "Invoice number: PDF-00045",
      "Total: INR 170.00",
      "Invoice date: 07/04/2026",
    ].forEach((line, index) =>
      page.drawText(line, { font, size: 18, x: 30, y: 600 - index * 40 }),
    );
    const bytes = await pdf.save();
    const result = await prepareServerPage(bytes.slice(), "application/pdf", 0);
    expect(result.text).toContain("00001002");
    expect(result.text).toContain("PDF-00045");
    expect(result.imageDataUrl).toBeNull();
    const raster = await prepareServerPage(
      bytes.slice(),
      "application/pdf",
      0,
      { forceRaster: true },
    );
    expect(raster.text).toBeNull();
    expect(raster.imageDataUrl).toMatch(/^data:image\/(?:png|jpeg);base64,/);
  });
  it("renders sparse PDF pages into a nonblank image on the server", async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([500, 700]);
    page.drawText("Receipt", { x: 40, y: 600, size: 24 });
    const result = await prepareServerPage(
      await pdf.save(),
      "application/pdf",
      0,
    );
    expect(result.text).toBeNull();
    expect(result.imageDataUrl).toMatch(/^data:image\/(?:png|jpeg);base64,/);
    const image = await loadImage(
      Buffer.from(result.imageDataUrl!.split(",")[1]!, "base64"),
    );
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
    expect(pixels.some((value, index) => index % 4 !== 3 && value < 100)).toBe(
      true,
    );
  });
  it("bounds large image dimensions and rejects invalid PDFs", async () => {
    const canvas = createCanvas(3000, 4000);
    canvas.getContext("2d").fillRect(0, 0, 3000, 4000);
    const result = await prepareServerPage(
      canvas.toBuffer("image/png"),
      "image/png",
      0,
    );
    const image = await loadImage(
      Buffer.from(result.imageDataUrl!.split(",")[1]!, "base64"),
    );
    expect(Math.max(image.width, image.height)).toBe(3000);
    await expect(
      prepareServerPage(new Uint8Array([1, 2]), "application/pdf", 0),
    ).rejects.toThrow();
  });
});
