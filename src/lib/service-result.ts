export type Result<T> =
  { ok: true; data: T } | { ok: false; error: string; code?: "NOT_FOUND" };

export function unwrap<T>(result: Result<T>): T {
  if (!result.ok)
    throw Object.assign(new Error(result.error), { code: result.code });
  return result.data;
}
