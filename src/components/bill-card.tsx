import { Link } from "@tanstack/react-router";
import { differenceInCalendarDays, parseISO } from "date-fns";
import {
  Armchair,
  ArrowUpRight,
  FileText,
  Monitor,
  Package,
  Refrigerator,
  Shirt,
} from "lucide-react";
import { StatusChip } from "./phone-shell";
import { displayDate, money, warrantyState, type Bill } from "@/lib/bills";

const categoryIcons = {
  Electronics: Monitor,
  Appliances: Refrigerator,
  Furniture: Armchair,
  Clothing: Shirt,
  Other: Package,
};

export function BillCard({ bill }: { bill: Bill }) {
  const cover = warrantyState(bill);
  const Icon =
    categoryIcons[bill.category as keyof typeof categoryIcons] ?? FileText;
  const returnDays = bill.returnExpiresAt
    ? differenceInCalendarDays(parseISO(bill.returnExpiresAt), new Date())
    : null;
  return (
    <Link
      to="/item/$itemId"
      params={{ itemId: bill.id }}
      className="group flex h-full min-w-0 flex-col rounded-xl border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {bill.category ?? "Uncategorized"}
          </p>
          <h3 className="break-words text-sm font-bold leading-snug">
            {bill.name}
          </h3>
          <p className="mt-1 break-words text-xs text-muted-foreground">
            {[bill.retailer, bill.brand].filter(Boolean).join(" · ") ||
              "Retailer not recorded"}
          </p>
        </div>
        <ArrowUpRight
          className="h-4 w-4 shrink-0 text-muted-foreground/60 transition group-hover:text-primary"
          aria-hidden="true"
        />
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-base font-bold tabular-nums">
          {money(bill.purchasePrice, bill.currency)}
        </p>
        <StatusChip tone={cover.status}>{cover.label}</StatusChip>
      </div>
      <div className="mt-3 flex-1">
        {bill.warrantyExpiresAt ? (
          <p className="text-xs text-muted-foreground">
            {cover.status === "expired" ? "Warranty ended" : "Warranty ends"}{" "}
            <span className="font-medium text-foreground">
              {displayDate(bill.warrantyExpiresAt)}
            </span>
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Add a warranty end date to track cover.
          </p>
        )}
        {bill.warrantyExpiresAt && bill.purchaseDate ? (
          <div
            className="mt-2.5 h-1 overflow-hidden rounded-full bg-secondary"
            aria-hidden="true"
          >
            <div
              className={`h-full rounded-full ${cover.status === "ending" ? "bg-accent" : cover.status === "expired" ? "bg-muted-foreground/40" : "bg-primary"}`}
              style={{ width: `${cover.percent}%` }}
            />
          </div>
        ) : null}
      </div>
      <div className="mt-4 border-t border-border/70 pt-3 text-xs text-muted-foreground">
        <p>
          {bill.purchaseDate ? (
            <>
              Purchased{" "}
              <span className="font-medium">
                {displayDate(bill.purchaseDate)}
              </span>
            </>
          ) : (
            "Purchase date not recorded"
          )}
        </p>
        {returnDays !== null && returnDays >= 0 ? (
          <p
            className={`mt-2 font-medium ${returnDays <= 7 ? "text-accent-foreground" : "text-primary"}`}
          >
            {returnDays === 0
              ? "Return deadline today"
              : `Return by ${displayDate(bill.returnExpiresAt)}`}
          </p>
        ) : null}
      </div>
    </Link>
  );
}
