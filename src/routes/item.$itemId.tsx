import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bell,
  Bot,
  Download,
  FileText,
  Mail,
  Phone,
  ShieldCheck,
} from "lucide-react";
import { PhoneShell, StatusChip } from "@/components/phone-shell";
import { items, statusLabel } from "@/lib/demo-data";

export const Route = createFileRoute("/item/$itemId")({
  loader: ({ params }) => {
    const item = items.find((i) => i.id === params.itemId);
    if (!item) throw notFound();
    return { item };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Item not found — Warrantly" }, { name: "robots", content: "noindex" }],
      };
    }
    const title = `${loaderData.item.name} — Warrantly`;
    const description = `Bill, warranty card and support contacts for your ${loaderData.item.brand} ${loaderData.item.category.toLowerCase()}.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: ItemScreen,
});

function ItemScreen() {
  const { item } = Route.useLoaderData();

  return (
    <PhoneShell>
      <header className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 border-b border-border px-5 py-4">
        <Link
          to="/vault"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-sm border border-border"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="min-w-0 truncate text-base font-extrabold">{item.brand}</h1>
      </header>

      <section className="hatch border-b border-border px-5 py-6">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <h2 className="min-w-0 text-[22px] font-extrabold leading-tight">{item.name}</h2>
          <StatusChip tone={item.status}>{statusLabel[item.status]}</StatusChip>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {item.status === "expired"
            ? "Warranty cover has ended."
            : `${item.monthsLeft} of ${item.warrantyMonths} months of cover left.`}
        </p>
      </section>

      <div className="grid gap-6 px-5 pt-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="space-y-6">
          <dl className="divide-y divide-border rounded-sm border border-border bg-card">
            {[
              ["Purchased", item.purchased],
              ["Amount paid", item.price],
              ["Serial / model", item.serial],
              ["Warranty length", `${item.warrantyMonths} months`],
              ["Category", item.category],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3">
                <dt className="min-w-0 truncate text-sm text-muted-foreground">{k}</dt>
                <dd className="shrink-0 text-sm font-semibold">{v}</dd>
              </div>
            ))}
          </dl>

          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Documents
            </h3>
            <ul className="mt-3 space-y-2">
              {item.docs.map((d) => (
                <li
                  key={d}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-sm border border-border bg-card px-3.5 py-3"
                >
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 truncate text-sm font-semibold">{d}</span>
                  <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="space-y-6">
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Who to escalate to
            </h3>
            <div className="mt-3 rounded-sm border border-border bg-card p-4">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-sm bg-foreground text-background">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{item.support.name}</p>
              <p className="truncate text-xs text-muted-foreground">{item.support.role}</p>
            </div>
          </div>
          <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
            <p className="flex items-center gap-2 truncate">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              {item.support.email}
            </p>
            <p className="flex items-center gap-2 truncate">
              <Phone className="h-3.5 w-3.5 shrink-0" />
              {item.support.phone}
            </p>
          </div>
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <Link
              to="/agent"
              className="inline-flex items-center justify-center gap-2 rounded-sm bg-primary px-4 py-3.5 text-sm font-bold text-primary-foreground shadow-[0_4px_0_0_var(--color-foreground)] active:translate-y-0.5 active:shadow-[0_2px_0_0_var(--color-foreground)]"
            >
              <Bot className="h-4 w-4" />
              Report an issue with this
            </Link>
            <button className="inline-flex items-center justify-center gap-2 rounded-sm border border-foreground px-4 py-3 text-sm font-bold">
              <Bell className="h-4 w-4" />
              Change reminders
            </button>
          </section>
        </aside>
      </div>
    </PhoneShell>
  );
}
