const defaultBase = "https://integrate.api.nvidia.com/v1";

export function nvidiaLlmConfig() {
  const base = (
    process.env["NVIDIA_LLM_BASE_URL"]?.trim() || defaultBase
  ).replace(/\/+$/, "");
  const dedicatedKey = process.env["NVIDIA_LLM_API_KEY"]?.trim();
  // Shared NVIDIA keys must never follow a custom endpoint configuration.
  const sharedKey =
    base === defaultBase
      ? process.env["NVIDIA_API_KEY"]?.trim() ||
        process.env["NVIDIA_NEMOTRON_OCR_API_KEY"]?.trim()
      : undefined;
  return {
    key: dedicatedKey || sharedKey || null,
    endpoint: `${base}/chat/completions`,
    model:
      process.env["NVIDIA_LLM_MODEL"]?.trim() ||
      "nvidia/nemotron-3.5-lightning-30b-a3b",
  };
}
