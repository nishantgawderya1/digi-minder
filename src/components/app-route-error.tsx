import {
  Link,
  useRouter,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useState } from "react";
import { PhoneShell } from "./phone-shell";

// Keep account navigation available for deleted records and failed requests.
export function AppRouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const missing =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "NOT_FOUND";
  async function retry() {
    if (retrying) return;
    setRetrying(true);
    try {
      await router.invalidate({ sync: true });
      reset();
    } catch {
      // Keep recovery controls available while the service is still down.
    } finally {
      setRetrying(false);
    }
  }
  return (
    <PhoneShell>
      <section
        className="mx-auto flex min-h-[60dvh] max-w-md flex-col justify-center px-5 py-10 text-center"
        aria-live="polite"
      >
        <h1 className="text-xl font-bold">
          {missing
            ? "This bill is no longer available"
            : "This page couldn't be loaded"}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {missing
            ? "It may have been deleted or may not belong to this account. Your other bills are still available."
            : "Check your connection and try again. You can also return to your vault."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {!missing && (
            <button
              type="button"
              disabled={retrying}
              onClick={() => void retry()}
              className="min-h-11 rounded-sm bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {retrying ? "Trying again…" : "Try again"}
            </button>
          )}
          <Link
            to="/vault"
            replace
            className="inline-flex min-h-11 items-center rounded-sm border border-border px-4 py-2 text-sm font-semibold"
          >
            Back to vault
          </Link>
        </div>
      </section>
    </PhoneShell>
  );
}
