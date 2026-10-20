import { ShieldCheck } from "lucide-react";

/** A small, data-free fallback for route loads that outlast the pending delay. */
export function Loading() {
  return (
    <main
      aria-label="Loading page"
      aria-busy="true"
      className="mx-auto min-h-dvh w-full max-w-6xl px-5 pb-8 pt-[max(2rem,env(safe-area-inset-top))] sm:px-8 lg:px-12 lg:pt-12"
    >
      <div className="flex items-center gap-2.5 font-display text-xl font-extrabold tracking-tight text-foreground">
        <ShieldCheck className="size-7 text-primary" aria-hidden="true" />
        Warrantly
      </div>
      <p className="mt-8 text-base font-medium text-muted-foreground">
        Loading your page…
      </p>
      <div
        aria-hidden="true"
        className="mt-6 space-y-6 motion-safe:animate-pulse"
      >
        <div className="h-8 w-1/2 max-w-64 rounded-lg bg-primary/10" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((card) => (
            <div
              key={card}
              className="h-28 rounded-2xl border border-border bg-card"
            />
          ))}
        </div>
        <div className="h-52 rounded-2xl border border-border bg-card" />
      </div>
    </main>
  );
}
