import { afterEach, describe, expect, it, vi } from "vitest";
import { runOcr } from "@/lib/ocr.server";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("OCR provider boundary", () => {
  it("rejects low-confidence text so Tesseract can recover misread identifiers", async () => {
    vi.stubEnv("NVIDIA_NEMOTRON_OCR_API_KEY", "unit-test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              {
                text_detections: [
                  {
                    text_prediction: {
                      text: "Invoice WRONG123",
                      confidence: 0.79,
                    },
                  },
                ],
              },
            ],
          }),
        ),
      ),
    );
    await expect(runOcr("data:image/jpeg;base64,test")).rejects.toThrow(
      "confidently",
    );
  });
  it("never calls NVIDIA without a key", async () => {
    vi.stubEnv("NVIDIA_NEMOTRON_OCR_API_KEY", "");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(runOcr("data:image/jpeg;base64,test")).rejects.toThrow(
      "OCR is not configured",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it("sends the documented image request and reads the actual response shape", async () => {
    vi.stubEnv("NVIDIA_NEMOTRON_OCR_API_KEY", "unit-test-key");
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              text_detections: [
                {
                  text_prediction: {
                    text: "Serial number: 00123",
                    confidence: 0.97,
                  },
                },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetch);
    expect(await runOcr("data:image/jpeg;base64,test")).toEqual({
      text: "Serial number: 00123",
      confidence: 0.97,
    });
    const init = fetch.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      input: [{ type: "image_url", url: "data:image/jpeg;base64,test" }],
      merge_levels: ["word"],
    });
    expect(init.headers).toMatchObject({
      Authorization: "Bearer unit-test-key",
    });
  });
  it.each([401, 429, 500])(
    "handles HTTP %s without returning provider internals",
    async (status) => {
      vi.stubEnv("NVIDIA_NEMOTRON_OCR_API_KEY", "unit-test-key");
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            new Response("sensitive provider error details", { status }),
          ),
      );
      await expect(runOcr("data:image/jpeg;base64,test")).rejects.toThrow(
        status === 429
          ? "OCR is busy"
          : status === 401
            ? "access was rejected"
            : "temporarily unavailable",
      );
    },
  );
  it("rejects malformed successful output instead of inventing results", async () => {
    vi.stubEnv("NVIDIA_NEMOTRON_OCR_API_KEY", "unit-test-key");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response('{"unexpected":"shape"}', { status: 200 }),
        ),
    );
    await expect(runOcr("data:image/jpeg;base64,test")).rejects.toThrow(
      "unexpected response",
    );
  });
  it("polls queued OCR jobs instead of discarding a 202 response", async () => {
    vi.stubEnv("NVIDIA_NEMOTRON_OCR_API_KEY", "unit-test-key");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 202,
          headers: { "nvcf-reqid": "11111111-1111-4111-8111-111111111111" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              { text_detections: [{ text_prediction: { text: "Receipt" } }] },
            ],
          }),
        ),
      );
    vi.stubGlobal("fetch", fetch);
    expect((await runOcr("data:image/jpeg;base64,test")).text).toBe("Receipt");
    expect(fetch.mock.calls[1]![0]).toBe(
      "https://api.nvcf.nvidia.com/v2/nvcf/pexec/status/11111111-1111-4111-8111-111111111111",
    );
    expect(fetch.mock.calls[1]![1].signal).toBe(fetch.mock.calls[0]![1].signal);
  });
  it("rejects empty OCR text so local OCR can retry the page", async () => {
    vi.stubEnv("NVIDIA_NEMOTRON_OCR_API_KEY", "unit-test-key");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response('{"data":[{"text_detections":[]}]}')),
    );
    await expect(runOcr("data:image/jpeg;base64,test")).rejects.toThrow(
      "No readable text",
    );
  });
  it("does not poll an untrusted queued-response URL", async () => {
    vi.stubEnv("NVIDIA_NEMOTRON_OCR_API_KEY", "unit-test-key");
    const fetch = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 202,
        headers: { "nvcf-reqid": "https://untrusted.invalid" },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    await expect(runOcr("data:image/jpeg;base64,test")).rejects.toThrow(
      "still processing",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
