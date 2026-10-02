import { readOcrResponse } from "./ocr";
import { ServiceError } from "./service-error.server";

export async function runOcr(imageDataUrl: string) {
  const apiKey = process.env["NVIDIA_NEMOTRON_OCR_API_KEY"];
  if (!apiKey)
    throw new ServiceError(
      "Automatic reading is unavailable. You can enter the bill details manually.",
    );
  const endpoint =
    process.env["NVIDIA_NEMOTRON_OCR_URL"] ||
    "https://ai.api.nvidia.com/v1/cv/nvidia/nemotron-ocr-v1";
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        input: [{ type: "image_url", url: imageDataUrl }],
        merge_levels: ["word"],
      }),
      signal: AbortSignal.timeout(50_000),
    });
    if (!response.ok) {
      if (response.status === 429)
        throw new ServiceError(
          "The document reader is busy. Please retry shortly.",
        );
      throw new ServiceError(
        "The document reader is unavailable. Retry or enter the details manually.",
      );
    }
    if (response.status === 202)
      throw new ServiceError(
        "The document reader is taking longer than expected. Please retry shortly.",
      );
    return readOcrResponse(await response.json());
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError(
      "We couldn't read this page. Retry or enter the details manually.",
    );
  }
}
