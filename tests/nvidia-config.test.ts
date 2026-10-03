import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nvidiaLlmConfig } from "@/lib/nvidia-config.server";

beforeEach(() => {
  for (const name of [
    "NVIDIA_LLM_API_KEY",
    "NVIDIA_API_KEY",
    "NVIDIA_NEMOTRON_OCR_API_KEY",
    "NVIDIA_LLM_BASE_URL",
    "NVIDIA_LLM_MODEL",
  ])
    vi.stubEnv(name, "");
});
afterEach(() => vi.unstubAllEnvs());

describe("Server-only NVIDIA configuration", () => {
  it("prefers a dedicated LLM key and trims whitespace", () => {
    vi.stubEnv("NVIDIA_LLM_API_KEY", " dedicated-key ");
    vi.stubEnv("NVIDIA_NEMOTRON_OCR_API_KEY", "ocr-key");
    expect(nvidiaLlmConfig().key).toBe("dedicated-key");
  });
  it("uses a shared NVIDIA key before the existing OCR key", () => {
    vi.stubEnv("NVIDIA_API_KEY", "shared-key");
    vi.stubEnv("NVIDIA_NEMOTRON_OCR_API_KEY", "ocr-key");
    expect(nvidiaLlmConfig().key).toBe("shared-key");
  });
  it("accepts the existing OCR key for the official hosted LLM endpoint", () => {
    vi.stubEnv("NVIDIA_NEMOTRON_OCR_API_KEY", " ocr-key ");
    vi.stubEnv("NVIDIA_LLM_BASE_URL", " https://integrate.api.nvidia.com/v1/ ");
    expect(nvidiaLlmConfig()).toMatchObject({
      key: "ocr-key",
      endpoint: "https://integrate.api.nvidia.com/v1/chat/completions",
    });
  });
  it.each([
    "https://other-provider.example/v1",
    "http://integrate.api.nvidia.com/v1",
    "https://integrate.api.nvidia.com.attacker.example/v1",
  ])("never sends a fallback NVIDIA key to %s", (base) => {
    vi.stubEnv("NVIDIA_LLM_BASE_URL", base);
    vi.stubEnv("NVIDIA_API_KEY", "shared-key");
    vi.stubEnv("NVIDIA_NEMOTRON_OCR_API_KEY", "ocr-key");
    expect(nvidiaLlmConfig().key).toBeNull();
  });
  it("keeps explicitly configured custom endpoints working with their dedicated key", () => {
    vi.stubEnv("NVIDIA_LLM_BASE_URL", "https://custom.example/v1");
    vi.stubEnv("NVIDIA_LLM_API_KEY", "custom-key");
    expect(nvidiaLlmConfig()).toMatchObject({
      key: "custom-key",
      endpoint: "https://custom.example/v1/chat/completions",
    });
  });
  it("reports no key when none is configured", () => {
    expect(nvidiaLlmConfig().key).toBeNull();
  });
});
