import { useRouterState } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";

const destinations: Record<string, string> = {
  "/": "Warrantly",
  "/auth": "sign-in",
  "/home": "Today",
  "/vault": "your vault",
  "/scan": "bill capture",
  "/agent": "the assistant",
  "/reminders": "reminders",
};

/** Keep the current screen usable while a navigation awaits its server data. */
export function NavigationFeedback() {
  const destination = useRouterState({
    select: (state) =>
      state.isLoading &&
      state.location.pathname !== state.resolvedLocation?.pathname
        ? state.location.pathname
        : "",
  });

  if (!destination) return null;
  const label =
    destinations[destination] ??
    (destination.startsWith("/review/") ? "bill review" : "bill details");

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-[max(0.75rem,env(safe-area-inset-top))]"
    >
      <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-primary/20 bg-card px-4 py-2.5 text-sm font-semibold text-primary shadow-sm">
        <LoaderCircle
          aria-hidden="true"
          className="h-4 w-4 shrink-0 animate-spin"
        />
        <span className="truncate">Opening {label}…</span>
      </span>
    </div>
  );
}
