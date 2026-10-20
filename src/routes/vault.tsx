import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ChevronDown,
  FileClock,
  FolderOpen,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { PhoneShell, ScreenHeader } from "@/components/phone-shell";
import { BillCard } from "@/components/bill-card";
import { loadVault, unwrap } from "@/lib/bill-functions";
import { categories, warrantyState } from "@/lib/bills";

type WarrantyFilter = "active" | "ending" | "expired" | "unknown";

export const Route = createFileRoute("/vault")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { status?: WarrantyFilter | undefined } => ({
    status:
      search["status"] === "active" ||
      search["status"] === "ending" ||
      search["status"] === "expired" ||
      search["status"] === "unknown"
        ? search["status"]
        : undefined,
  }),
  loader: async () => unwrap(await loadVault()),
  component: VaultScreen,
});

const warrantyFilters = [
  { value: "", label: "All bills" },
  { value: "active", label: "Active" },
  { value: "ending", label: "Ending soon" },
  { value: "expired", label: "Expired" },
  { value: "unknown", label: "Missing date" },
] as const;

function VaultScreen() {
  const { bills, drafts } = Route.useLoaderData();
  const status = Route.useSearch().status ?? "";
  const navigate = Route.useNavigate();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("newest");
  const setStatus = (value: string) => {
    const selected = warrantyFilters.find(
      (filter) => filter.value === value,
    )?.value;
    void navigate({ search: { status: selected || undefined } });
  };
  const matchingBills = useMemo(
    () =>
      bills.filter((bill) => {
        const matches = [
          bill.name,
          bill.retailer,
          bill.brand,
          bill.category,
          bill.serialNumber,
          bill.modelNumber,
          bill.barcode,
          bill.invoiceNumber,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query.trim().toLowerCase());
        return matches && (!category || bill.category === category);
      }),
    [bills, query, category],
  );
  const counts = useMemo(() => {
    const result = {
      "": matchingBills.length,
      active: 0,
      ending: 0,
      expired: 0,
      unknown: 0,
    };
    for (const bill of matchingBills) result[warrantyState(bill).status] += 1;
    return result;
  }, [matchingBills]);
  const filtered = useMemo(
    () =>
      matchingBills
        .filter((bill) => !status || warrantyState(bill).status === status)
        .sort((a, b) => {
          if (sort === "name")
            return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
          if (sort === "expiry") {
            const rank = (bill: (typeof bills)[number]) => {
              const state = warrantyState(bill).status;
              return state === "unknown" ? 2 : state === "expired" ? 1 : 0;
            };
            return (
              rank(a) - rank(b) ||
              (a.warrantyExpiresAt ?? "9999-12-31").localeCompare(
                b.warrantyExpiresAt ?? "9999-12-31",
              ) ||
              a.name.localeCompare(b.name) ||
              a.id.localeCompare(b.id)
            );
          }
          return (
            Date.parse(String(b.createdAt)) - Date.parse(String(a.createdAt)) ||
            a.id.localeCompare(b.id)
          );
        }),
    [matchingBills, status, sort],
  );
  const hasFilters = Boolean(query.trim() || category || status);
  const clearFilters = () => {
    setQuery("");
    setCategory("");
    setStatus("");
  };
  const control =
    "h-11 min-w-0 rounded-xl border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15";
  const draftRow = (draft: (typeof drafts)[number]) => (
    <Link
      to="/review/$documentId"
      params={{ documentId: draft.id }}
      key={draft.id}
      className="group flex items-center gap-3 rounded-lg p-3 transition hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
        <FileClock className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{draft.filename}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {draft.status === "pending"
            ? "Upload incomplete · Open to continue"
            : draft.status === "failed"
              ? "Reading incomplete · Check or enter details"
              : draft.status === "processing"
                ? "Reading in background · Your draft is saved"
                : "Ready to review · Check details and save"}
        </p>
      </div>
      <ArrowRight
        className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary"
        aria-hidden="true"
      />
    </Link>
  );
  return (
    <PhoneShell>
      <ScreenHeader
        eyebrow="Your records"
        title="The vault"
        right={
          <Link
            to="/scan"
            title="Add a bill"
            aria-label="Add a bill"
            className="inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Add a bill</span>
          </Link>
        }
      />
      <div className="space-y-6 p-5 lg:p-8">
        <section aria-label="Find your bills" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Receipts, cover dates and purchase details, all in one place.
          </p>
          <label className="relative block min-w-0">
            <span className="sr-only">Search bills</span>
            <Search
              className="pointer-events-none absolute left-4 top-4 h-5 w-5 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search items, shops or invoice numbers"
              className={`${control} h-13 w-full pl-12 pr-4 shadow-sm`}
            />
          </label>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Filter by warranty status"
          >
            {warrantyFilters.map((filter) => (
              <button
                key={filter.value}
                type="button"
                aria-pressed={status === filter.value}
                onClick={() => setStatus(filter.value)}
                className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${status === filter.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}
              >
                {filter.label}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${status === filter.value ? "bg-white/15" : "bg-secondary text-foreground"}`}
                >
                  {counts[filter.value]}
                </span>
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:flex sm:items-start sm:justify-between">
            <details className="group min-w-0 flex-1 rounded-xl border border-border bg-card">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                <SlidersHorizontal
                  className="h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
                More filters
                {category ? (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-primary"
                    aria-label="Category filter applied"
                  />
                ) : null}
                <ChevronDown
                  className="ml-auto h-4 w-4 text-muted-foreground transition group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <div className="grid gap-3 border-t border-border p-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                  Category
                  <select
                    aria-label="Category filter"
                    className={`${control} w-full font-normal text-foreground`}
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                  >
                    <option value="">All categories</option>
                    {categories.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                  Warranty
                  <select
                    aria-label="Warranty filter"
                    className={`${control} w-full font-normal text-foreground`}
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                  >
                    <option value="">All warranties</option>
                    <option value="active">Active</option>
                    <option value="ending">Ending in 30 days</option>
                    <option value="expired">Expired</option>
                    <option value="unknown">No cover date</option>
                  </select>
                </label>
              </div>
            </details>
            <label className="flex min-h-11 min-w-0 items-center gap-2">
              <span className="sr-only">Sort bills</span>
              <select
                aria-label="Sort bills"
                className={`${control} w-full sm:w-auto`}
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="newest">Newest added</option>
                <option value="name">Name: A–Z</option>
                <option value="expiry">Warranty ending soon</option>
              </select>
            </label>
          </div>
        </section>
        {drafts.length ? (
          <section className="rounded-xl border border-border bg-card p-2">
            <div className="flex flex-wrap items-center justify-between gap-1 px-3 pb-1 pt-2">
              <h2 className="text-sm font-bold">
                Needs review ({drafts.length})
              </h2>
              <span className="text-xs text-muted-foreground">
                Continue where you left off
              </span>
            </div>
            <div className="divide-y divide-border/60">
              {drafts.slice(0, 2).map(draftRow)}
            </div>
            {drafts.length > 2 ? (
              <details className="group border-t border-border/60">
                <summary className="flex min-h-10 cursor-pointer list-none items-center justify-center gap-2 px-3 text-xs font-semibold text-primary [&::-webkit-details-marker]:hidden">
                  Show {drafts.length - 2} more drafts
                  <ChevronDown
                    className="h-3.5 w-3.5 transition group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <div className="divide-y divide-border/60">
                  {drafts.slice(2).map(draftRow)}
                </div>
              </details>
            ) : null}
          </section>
        ) : null}
        <section aria-label="Saved bills">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground" role="status">
              {filtered.length} of {bills.length} saved bills
              {status === "ending" ? " · Ending within 30 days" : ""}
            </p>
            {hasFilters && filtered.length ? (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex min-h-8 items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" /> Clear filters
              </button>
            ) : null}
          </div>
          {filtered.length ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((bill) => (
                <BillCard key={bill.id} bill={bill} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-card px-5 py-12 text-center">
              <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-secondary text-primary">
                {bills.length ? (
                  <Search className="h-6 w-6" aria-hidden="true" />
                ) : (
                  <FolderOpen className="h-6 w-6" aria-hidden="true" />
                )}
              </span>
              <h2 className="text-base font-bold">
                {bills.length
                  ? "No bills match these filters."
                  : "No saved bills yet."}
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                {bills.length
                  ? "Try another item name or shop, or clear your filters to see every saved bill."
                  : "Add your first receipt to keep its purchase details, warranty and return deadline together."}
              </p>
              {bills.length ? (
                <button
                  type="button"
                  className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                  onClick={clearFilters}
                >
                  Clear filters
                </button>
              ) : (
                <Link
                  to="/scan"
                  className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" /> Add a bill
                </Link>
              )}
            </div>
          )}
        </section>
      </div>
    </PhoneShell>
  );
}
