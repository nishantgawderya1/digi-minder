import { ServiceError } from "./service-error.server";

type Operation = "OCR" | "field extraction" | "assistant";

function providerError(operation: Operation, status: number) {
  if (status === 401 || status === 403)
    return `NVIDIA ${operation} access was rejected. Check the server API key and model access.`;
  if (status === 402)
    return `NVIDIA ${operation} credits are exhausted. Check the NVIDIA account.`;
  if (status === 429)
    return `NVIDIA ${operation} is busy. Please retry shortly.`;
  if (status === 413 || status === 422 || status === 400)
    if (operation === "assistant")
      return "NVIDIA assistant could not accept this question. Try a shorter question or start a new chat.";
    else
      return `NVIDIA ${operation} could not accept this request. Try a clearer, cropped image or enter the details manually.`;
  if (status === 404)
    return `The NVIDIA ${operation} endpoint is unavailable. Check the server model configuration.`;
  return `NVIDIA ${operation} is temporarily unavailable. Please retry shortly.`;
}

export async function nvidiaJson(
  endpoint: string,
  apiKey: string,
  body: unknown,
  operation: Operation,
) {
  const signal = AbortSignal.timeout(50_000);
  try {
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(operation === "OCR" ? { "NVCF-POLL-SECONDS": "5" } : {}),
    };
    let response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
      redirect: "error",
    });
    // Hosted OCR may queue a request. Poll its ID instead of treating 202 as failure.
    const requestId = response.headers.get("nvcf-reqid");
    for (let poll = 0; response.status === 202 && poll < 8; poll++) {
      if (
        new URL(endpoint).hostname !== "ai.api.nvidia.com" ||
        !requestId ||
        !/^[0-9a-f-]{36}$/i.test(requestId)
      )
        break;
      await response.body?.cancel();
      response = await fetch(
        `https://api.nvcf.nvidia.com/v2/nvcf/pexec/status/${requestId}`,
        { headers, signal, redirect: "error" },
      );
    }
    if (response.status === 202)
      throw new ServiceError(
        `NVIDIA ${operation} is still processing. Please retry shortly.`,
      );
    if (!response.ok) {
      // Never log document contents, provider response bodies, or credentials.
      console.warn("NVIDIA request failed", {
        operation,
        status: response.status,
      });
      await response.body?.cancel();
      throw new ServiceError(providerError(operation, response.status));
    }
    return (await response.json()) as unknown;
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    const timedOut =
      signal.aborted ||
      (error instanceof Error && /TimeoutError|AbortError/.test(error.name));
    console.warn("NVIDIA request failed", {
      operation,
      reason: timedOut ? "timeout" : "network-or-response",
    });
    throw new ServiceError(
      timedOut
        ? `NVIDIA ${operation} timed out. Please retry shortly.`
        : `NVIDIA ${operation} could not be reached or returned an unreadable response. Please retry.`,
    );
  }
}
