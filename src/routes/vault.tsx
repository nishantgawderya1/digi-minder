import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText, Search } from "lucide-react";
import { useState } from "react";
import { PhoneShell, ScreenHeader, StatusChip } from "@/components/phone-shell";
import { items, statusLabel, type ItemStatus } from "@/lib/demo-data";

export const Route = createFileRoute("/vault")({
  head: () => ({
    meta: [
      { title: "Vault — Warrantly" },
      {
        name: "description",
        content: "Every item you own, with its bill, warranty card and cover status.",
      },
      { property: "og:title", content: "Vault — Warrantly" },
      {
        property: "og:description",
        content: "Every item you own, with its bill, warranty card and cover status.",
      },
    ],
  }),
  component: VaultScreen,
});

const filters = ["All", "In cover", "Ending soon", "Cover ended"] as const;

function VaultScreen() {
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");

  const shown = items.filter((i) =>
    filter === "All" ? true : statusLabel[i.status as ItemStatus] === filter,
  );

  return (
    <PhoneShell>
      <ScreenHeader eyebrow="4 items · ₹3.2L covered" title="Your vault" />

      <div className="px-5 pt-4 lg:px-8">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-sm border border-input bg-card px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            placeholder="Search item, brand or shop"
            className="min-w-0 bg-transparent text-sm outline-none"
          />
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`shrink-0 rounded-sm px-3 py-1.5 text-xs font-bold uppercase tracking-wider ${
                filter === f
                  ? "bg-foreground text-background"
                  : "border border-border text-muted-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-4 grid gap-2 px-5 lg:grid-cols-3 lg:px-8">
        {shown.map((item) => (
          <li key={item.id}>
            <Link
              to="/item/$itemId"
              params={{ itemId: item.id }}
              className="block h-full rounded-sm border border-border bg-card p-4 active:bg-secondary"
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{item.name}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {item.brand} · {item.category} · {item.price}
                  </p>
                </div>
                <StatusChip tone={item.status}>{statusLabel[item.status]}</StatusChip>
              </div>

              <div className="mt-3 h-1.5 w-full rounded-sm bg-secondary">
                <div
                  className={`h-1.5 rounded-sm ${
                    item.status === "ending" ? "bg-accent" : "bg-primary"
                  }`}
                  style={{
                    width: `${Math.round((item.monthsLeft / item.warrantyMonths) * 100)}%`,
                  }}
                />
              </div>
              <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-3 text-xs text-muted-foreground">
                <span className="truncate">
                  {item.status === "expired"
                    ? "Cover ended"
                    : `${item.monthsLeft} of ${item.warrantyMonths} months left`}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <FileText className="h-3 w-3" />
                  {item.docs.length} docs
                </span>
              </div>
            </Link>
          </li>
        ))}
        {shown.length === 0 ? (
          <li className="rounded-sm border border-dashed border-border p-6 text-center text-sm text-muted-foreground lg:col-span-3">
            Nothing here yet.
          </li>
        ) : null}
      </ul>
    </PhoneShell>
  );
}
