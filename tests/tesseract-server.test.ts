import { expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { readWithServerTesseract } from "@/lib/tesseract.server";

it("recognizes a receipt image with actual server-side Tesseract", async () => {
  const canvas = createCanvas(800, 700);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, 800, 700);
  ctx.fillStyle = "black";
  ctx.font = "30px Arial";
  [
    "TEST RECEIPT",
    "Product name: Reading lamp",
    "Serial number: 001234",
    "Total: INR 170.00",
    "Invoice date: 07/04/2026",
  ].forEach((line, index) => ctx.fillText(line, 35, 80 + index * 70));
  const result = await readWithServerTesseract(canvas.toBuffer("image/png"));
  expect(result.text).toContain("001234");
  expect(result.text).toContain("Reading lamp");
  expect(result.text).toContain("170.00");
  expect(result.confidence).toBeGreaterThan(0.8);
}, 110000);

it("reads slightly tilted, faint receipt text with the actual Tesseract engine", async () => {
  const canvas = createCanvas(1000, 700);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(80, 80);
  ctx.rotate((5 * Math.PI) / 180);
  ctx.fillStyle = "#999999";
  ctx.font = "28px Arial";
  [
    "TEST RECEIPT",
    "Product name: Reading lamp",
    "Serial number: 001234",
    "Total: INR 170.00",
    "Invoice date: 07/04/2026",
  ].forEach((line, index) => ctx.fillText(line, 0, 30 + index * 70));
  const result = await readWithServerTesseract(canvas.toBuffer("image/png"));
  expect(result.text).toContain("Reading lamp");
  expect(result.text).toContain("001234");
  expect(result.text).toContain("170.00");
}, 110000);
