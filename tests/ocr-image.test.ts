import { describe, expect, it, vi } from "vitest";
import { encodeOcrImage, ocrImageSize, pdfOcrScale } from "@/lib/ocr-image";

describe("Receipt image preparation", () => {
  it("upscales small receipts without exceeding a two-times enlargement", () => {
    expect(ocrImageSize(600, 800)).toEqual({ width: 1200, height: 1600 });
    expect(ocrImageSize(100, 200)).toEqual({ width: 200, height: 400 });
  });
  it("keeps adequate resolution and bounds large photos", () => {
    expect(ocrImageSize(1600, 2000)).toEqual({ width: 1600, height: 2000 });
    expect(ocrImageSize(4000, 3000)).toEqual({ width: 3000, height: 2250 });
  });
  it("targets 300 DPI for PDFs within the page-image size bound", () => {
    expect(pdfOcrScale(400, 600)).toBeCloseTo(300 / 72);
    expect(pdfOcrScale(600, 800)).toBe(3.75);
  });
  it("preserves small text as PNG without JPEG compression", () => {
    const toDataURL = vi.fn().mockReturnValue("data:image/png;base64,test");
    expect(encodeOcrImage({ toDataURL })).toContain("image/png");
    expect(toDataURL).toHaveBeenCalledExactlyOnceWith("image/png");
  });
  it("reduces JPEG quality only when needed to fit the provider request limit", () => {
    const toDataURL = vi
      .fn()
      .mockReturnValue("x".repeat(2_400_001))
      .mockReturnValueOnce("x".repeat(2_400_001))
      .mockReturnValueOnce("x".repeat(2_400_001))
      .mockReturnValueOnce("data:image/jpeg;base64,test");
    expect(encodeOcrImage({ toDataURL })).toContain("image/jpeg");
    expect(toDataURL.mock.calls).toEqual([
      ["image/png"],
      ["image/jpeg", 0.94],
      ["image/jpeg", 0.86],
    ]);
  });
  it("rejects images that cannot fit instead of sending an oversized request", () => {
    expect(() =>
      encodeOcrImage({ toDataURL: () => "x".repeat(2_400_001) }),
    ).toThrow("too large");
  });
});
