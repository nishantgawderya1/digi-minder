import { readOcrResponse } from "./ocr";
import { ServiceError } from "./service-error.server";
import { nvidiaJson } from "./nvidia.server";

export async function runOcr(imageDataUrl: string) {
  const apiKey = process.env["NVIDIA_NEMOTRON_OCR_API_KEY"];
  if (!apiKey)
    throw new ServiceError(
      "NVIDIA OCR is not configured on this server. Enter the details manually or try again after setup.",
    );
  const endpoint =
    process.env["NVIDIA_NEMOTRON_OCR_URL"] ||
    "https://ai.api.nvidia.com/v1/cv/nvidia/nemotron-ocr-v1";
  const payload = await nvidiaJson(
    endpoint,
    apiKey,
    {
      input: [{ type: "image_url", url: imageDataUrl }],
      merge_levels: ["word"],
    },
    "OCR",
  );
  try {
    const result = readOcrResponse(payload);
    if (!result.text.trim())
      throw new ServiceError(
        "No readable text was found. Try a clearer, upright photo with the full bill in focus, or enter the details manually.",
      );
    if (result.confidence !== null && result.confidence < 0.85)
      throw new ServiceError(
        "NVIDIA OCR could not read this page confidently. Trying local OCR is recommended before reviewing the details.",
      );
    return result;
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError(
      "NVIDIA OCR returned an unexpected response. Retry or enter the details manually.",
    );
  }
}
