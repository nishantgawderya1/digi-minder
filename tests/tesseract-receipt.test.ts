import { afterEach, describe, expect, it, vi } from "vitest";
import { PSM, type Worker } from "tesseract.js";
import { recognizeReceipt } from "@/lib/tesseract-receipt";

function fakeWorker(readings: { text: string; confidence: number }[]) {
  const recognize = vi.fn();
  for (const data of readings) recognize.mockResolvedValueOnce({ data });
  const worker = {
    recognize,
    setParameters: vi.fn().mockResolvedValue(undefined),
    terminate: vi.fn().mockResolvedValue(undefined),
  };
  return { worker, create: async () => worker as unknown as Worker };
}
afterEach(() => vi.useRealTimers());

describe("Bounded Tesseract receipt reading", () => {
  it("deskews a confident page once and releases the worker", async () => {
    const page = {
      text: "Product name: Test lamp\nSerial number: 001234\nTotal: INR 170.00",
      confidence: 94,
    };
    const { worker, create } = fakeWorker([page]);
    expect(await recognizeReceipt(create, "image")).toEqual({
      text: page.text,
      confidence: 0.94,
    });
    expect(worker.recognize).toHaveBeenCalledExactlyOnceWith("image", {
      rotateAuto: true,
    });
    expect(worker.setParameters).toHaveBeenCalledWith(
      expect.objectContaining({
        tessedit_pageseg_mode: PSM.AUTO,
        user_defined_dpi: "300",
      }),
    );
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
  it("recovers an empty first pass using sparse text and adaptive thresholding", async () => {
    const { worker, create } = fakeWorker([
      { text: "", confidence: 0 },
      { text: "Serial number: 001234\nTotal: INR 170.00", confidence: 90 },
    ]);
    const retry = vi.fn();
    expect((await recognizeReceipt(create, "image", retry)).text).toContain(
      "001234",
    );
    expect(worker.recognize).toHaveBeenCalledTimes(2);
    expect(worker.setParameters).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tessedit_pageseg_mode: PSM.SPARSE_TEXT,
        thresholding_method: "2",
      }),
    );
    expect(retry).toHaveBeenCalledTimes(1);
  });
  it("chooses one better reading without mixing identifiers from different passes", async () => {
    const { create } = fakeWorker([
      {
        text: "Product name: Reading lamp\nSerial number: 009999\nTotal: INR 170.00",
        confidence: 35,
      },
      {
        text: "Product name: Reading lamp\nSerial number: 001234\nTotal: INR 170.00",
        confidence: 91,
      },
    ]);
    const result = await recognizeReceipt(create, "image");
    expect(result.text).toContain("001234");
    expect(result.text).not.toContain("009999");
  });
  it("does not choose a tiny fragment solely because its confidence is higher", async () => {
    const page = {
      text: "Product name: Reading lamp\nSerial number: 001234\nTotal: INR 170.00",
      confidence: 75,
    };
    const { create } = fakeWorker([page, { text: "Receipt", confidence: 99 }]);
    expect((await recognizeReceipt(create, "image")).text).toBe(page.text);
  });
  it("leaves unreadable pages blank and terminates after two passes", async () => {
    const { worker, create } = fakeWorker([
      { text: " ", confidence: 95 },
      { text: "", confidence: 0 },
    ]);
    await expect(recognizeReceipt(create, "image")).rejects.toThrow(
      "No readable text",
    );
    expect(worker.recognize).toHaveBeenCalledTimes(2);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
  it("terminates after a worker error", async () => {
    const { worker, create } = fakeWorker([]);
    worker.recognize.mockRejectedValue(new Error("Worker failed"));
    await expect(recognizeReceipt(create, "image")).rejects.toThrow(
      "Worker failed",
    );
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
  it("terminates a worker even when initialization completes after the timeout", async () => {
    vi.useFakeTimers();
    const { worker } = fakeWorker([]);
    let resolve!: (value: Worker) => void;
    const creation = new Promise<Worker>((done) => {
      resolve = done;
    });
    const assertion = expect(
      recognizeReceipt(() => creation, "image"),
    ).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(90_000);
    await assertion;
    resolve(worker as unknown as Worker);
    await Promise.resolve();
    await Promise.resolve();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(worker.recognize).not.toHaveBeenCalled();
  });
});
