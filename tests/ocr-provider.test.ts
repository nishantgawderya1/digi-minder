import { afterEach, describe, expect, it, vi } from "vitest";
import { runOcr } from "@/lib/ocr.server";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("OCR provider boundary", () => {
  it("never calls NVIDIA without a key", async () => {
    vi.stubEnv("NVIDIA_NEMOTRON_OCR_API_KEY", "");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(runOcr("data:image/jpeg;base64,test")).rejects.toThrow(
      "Automatic reading is unavailable",
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
        status === 429 ? "reader is busy" : "reader is unavailable",
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
      "couldn't read this page",
    );
  });
});
