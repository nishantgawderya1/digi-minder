import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, FileClock, Plus, Search } from "lucide-react";
import { PhoneShell, ScreenHeader } from "@/components/phone-shell";
import { BillCard } from "@/components/bill-card";
import { requireCurrentUser } from "@/lib/route-auth";
import { loadVault, unwrap } from "@/lib/bill-functions";
import { categories, warrantyState } from "@/lib/bills";

export const Route = createFileRoute("/vault")({
  beforeLoad: () => requireCurrentUser(),
  loader: async () => unwrap(await loadVault()),
  component: VaultScreen,
});
function VaultScreen() {
  const { bills, drafts } = Route.useLoaderData();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const filtered = useMemo(
    () =>
      bills.filter((bill) => {
        const matches = [
          bill.name,
          bill.retailer,
          bill.brand,
          bill.category,
          bill.serialNumber,
          bill.barcode,
          bill.invoiceNumber,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query.trim().toLowerCase());
        return (
          matches &&
          (!category || bill.category === category) &&
          (!status || warrantyState(bill).status === status)
        );
      }),
    [bills, query, category, status],
  );
  const control =
    "h-11 min-w-0 rounded-sm border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none";
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
            className="grid h-10 w-10 place-items-center rounded-sm bg-primary text-primary-foreground"
          >
            <Plus className="h-5 w-5" />
          </Link>
        }
      />
      <div className="space-y-7 p-5 lg:p-8">
        {drafts.length ? (
          <section>
            <h2 className="mb-3 text-sm font-bold">
              Needs review ({drafts.length})
            </h2>
            <div className="divide-y divide-border border-y border-border">
              {drafts.map((draft) => (
                <Link
                  to="/review/$documentId"
                  params={{ documentId: draft.id }}
                  key={draft.id}
                  className="flex items-center gap-3 py-3"
                >
                  <FileClock className="h-5 w-5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-semibold">
                      {draft.filename}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {draft.status === "pending"
                        ? "Upload incomplete"
                        : draft.status === "failed"
                          ? "Reading incomplete"
                          : draft.status === "processing"
                            ? "Reading in background"
                            : "Review details"}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0" />
                </Link>
              ))}
            </div>
          </section>
        ) : null}
        <section>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
            <label className="relative min-w-0 sm:col-span-2 xl:col-span-1">
              <span className="sr-only">Search bills</span>
              <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search bills"
                className={`${control} w-full pl-9`}
              />
            </label>
            <select
              aria-label="Category filter"
              className={control}
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">All categories</option>
              {categories.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
            <select
              aria-label="Warranty filter"
              className={control}
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">All warranties</option>
              <option value="active">Active</option>
              <option value="ending">Ending in 30 days</option>
              <option value="expired">Expired</option>
              <option value="unknown">No cover date</option>
            </select>
          </div>
          <p className="my-4 text-xs text-muted-foreground">
            {filtered.length} of {bills.length} saved bills
          </p>
          {filtered.length ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {filtered.map((bill) => (
                <BillCard key={bill.id} bill={bill} />
              ))}
            </div>
          ) : (
            <div className="border-y border-border py-12 text-center">
              <p className="text-sm text-muted-foreground">
                {bills.length
                  ? "No bills match these filters."
                  : "No saved bills yet."}
              </p>
              {bills.length ? (
                <button
                  type="button"
                  className="mt-4 text-sm font-bold text-primary"
                  onClick={() => {
                    setQuery("");
                    setCategory("");
                    setStatus("");
                  }}
                >
                  Clear filters
                </button>
              ) : (
                <Link
                  to="/scan"
                  className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-primary"
                >
                  <Plus className="h-4 w-4" />
                  Add a bill
                </Link>
              )}
            </div>
          )}
        </section>
      </div>
    </PhoneShell>
  );
}
