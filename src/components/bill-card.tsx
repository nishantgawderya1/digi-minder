import { Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { StatusChip } from "./phone-shell";
import { displayDate, money, warrantyState, type Bill } from "@/lib/bills";

export function BillCard({ bill }: { bill: Bill }) {
  const cover = warrantyState(bill);
  return (
    <Link
      to="/item/$itemId"
      params={{ itemId: bill.id }}
      className="block h-full min-w-0 rounded-sm border border-border bg-card p-4 transition hover:border-primary"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-sm bg-secondary text-primary">
          <FileText className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-sm font-bold">{bill.name}</h3>
          <p className="mt-1 break-words text-xs text-muted-foreground">
            {[bill.retailer, bill.brand].filter(Boolean).join(" · ") ||
              "Retailer not recorded"}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold">
          {money(bill.purchasePrice, bill.currency)}
        </p>
        <StatusChip tone={cover.status}>{cover.label}</StatusChip>
      </div>
      {bill.warrantyExpiresAt && bill.purchaseDate ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-sm bg-secondary">
          <div
            className={`h-full ${cover.status === "ending" ? "bg-accent" : "bg-primary"}`}
            style={{ width: `${cover.percent}%` }}
          />
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span>{displayDate(bill.purchaseDate)}</span>
        <span>{bill.category ?? "Uncategorized"}</span>
      </div>
    </Link>
  );
}
