import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Bot, Clock, FileText, ScanLine } from "lucide-react";
import { PhoneShell, ScreenHeader, StatusChip } from "@/components/phone-shell";
import { items, statusLabel, timeline } from "@/lib/demo-data";
import { requireCurrentUser } from "@/lib/route-auth";

export const Route = createFileRoute("/home")({
  beforeLoad: () => requireCurrentUser(),
  head: () => ({
    meta: [
      { title: "Today — Warrantly" },
      {
        name: "description",
        content: "What needs attention today across your bills and warranties.",
      },
      { property: "og:title", content: "Today — Warrantly" },
      {
        property: "og:description",
        content: "What needs attention today across your bills and warranties.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const urgent = items.find((i) => i.status === "ending")!;

  return (
    <PhoneShell>
      <ScreenHeader
        eyebrow="Thursday, 1 October"
        title="Good afternoon, Nishant"
        right={
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-foreground font-display text-sm font-extrabold text-background">
            NG
          </span>
        }
      />

      <div className="grid gap-6 px-5 pt-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:px-8">
        <section>
          <div className="rounded-sm border border-foreground bg-accent/20 p-4 lg:p-6">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                  Needs you first
                </p>
                <h2 className="mt-1 text-lg font-bold leading-snug lg:text-2xl">
                  {urgent.name}
                </h2>
              </div>
              <StatusChip tone="ending">{urgent.monthsLeft} mo left</StatusChip>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Cover ends 12 Oct 2026. If anything is wrong, raise it now while
              repairs are still free.
            </p>
            <div className="mt-4 flex gap-2">
              <Link
                to="/agent"
                className="flex-1 rounded-sm bg-foreground px-3 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-background"
              >
                Report an issue
              </Link>
              <Link
                to="/vault"
                className="rounded-sm border border-foreground px-3 py-2.5 text-xs font-bold uppercase tracking-wider"
              >
                Details
              </Link>
            </div>
          </div>
        </section>

        <section>
          <div className="grid grid-cols-2 gap-2">
            <Link
              to="/scan"
              className="rounded-sm border border-border bg-card p-4 active:bg-secondary"
            >
              <ScanLine className="h-5 w-5 text-primary" strokeWidth={2.2} />
              <p className="mt-3 text-sm font-bold">Scan a bill</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Read in seconds
              </p>
            </Link>
            <Link
              to="/agent"
              className="rounded-sm border border-border bg-card p-4 active:bg-secondary"
            >
              <Bot className="h-5 w-5 text-primary" strokeWidth={2.2} />
              <p className="mt-3 text-sm font-bold">Ask assistant</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Drafts complaints
              </p>
            </Link>
          </div>
        </section>
      </div>

      <div className="grid gap-7 px-5 pt-7 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start lg:px-8">
        <section>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Coming up
          </h2>
          <ol className="mt-3 space-y-0 border-l border-border pl-4">
            {timeline.map((t) => (
              <li key={t.title} className="relative pb-5">
                <span
                  className={`absolute -left-[22px] top-1 h-3 w-3 rounded-full border-2 border-background ${
                    t.tone === "warn"
                      ? "bg-accent"
                      : t.tone === "calm"
                        ? "bg-primary"
                        : "bg-muted-foreground"
                  }`}
                />
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {t.when}
                </p>
                <p className="mt-1 text-sm font-bold">{t.title}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {t.detail}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section className="lg:pt-0">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <h2 className="min-w-0 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Recently added
            </h2>
            <Link
              to="/vault"
              className="flex shrink-0 items-center gap-1 text-xs font-bold text-primary"
            >
              See all <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <ul className="mt-3 grid gap-2 border-y border-border py-2 lg:grid-cols-2 lg:border-y-0 lg:py-0">
            {items.slice(0, 3).map((item) => (
              <li key={item.id}>
                <Link
                  to="/item/$itemId"
                  params={{ itemId: item.id }}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-sm border-border py-3.5 active:bg-secondary lg:border lg:bg-card lg:px-3.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{item.name}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                      <FileText className="h-3 w-3 shrink-0" />
                      {item.brand} · {item.purchased} · {item.price}
                    </p>
                  </div>
                  <StatusChip tone={item.status}>
                    {statusLabel[item.status]}
                  </StatusChip>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PhoneShell>
  );
}
