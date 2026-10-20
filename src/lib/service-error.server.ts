import type { Result } from "./service-result";
export type { Result } from "./service-result";

export class ServiceError extends Error {
  constructor(
    message: string,
    readonly code?: "NOT_FOUND",
  ) {
    super(message);
  }
}

export async function serviceResult<T>(
  action: () => Promise<T>,
): Promise<Result<T>> {
  try {
    return { ok: true, data: await action() };
  } catch (error) {
    if (error instanceof ServiceError)
      return {
        ok: false,
        error: error.message,
        ...(error.code ? { code: error.code } : {}),
      };
    console.error(
      "Bill operation failed:",
      error instanceof Error ? error.name : "UnknownError",
    );
    return {
      ok: false,
      error: "We couldn't complete this request. Please try again.",
    };
  }
}
