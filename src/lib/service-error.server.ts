export class ServiceError extends Error {}

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
export async function serviceResult<T>(
  action: () => Promise<T>,
): Promise<Result<T>> {
  try {
    return { ok: true, data: await action() };
  } catch (error) {
    if (error instanceof ServiceError)
      return { ok: false, error: error.message };
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
