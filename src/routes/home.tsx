import { createFileRoute, Link } from "@tanstack/react-router";
import { UserButton, useUser } from "@clerk/tanstack-react-start";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  FileClock,
  FileText,
  ScanLine,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { PhoneShell, ScreenHeader } from "@/components/phone-shell";
import { BillCard } from "@/components/bill-card";
import { requireCurrentUser } from "@/lib/route-auth";
import { loadVault, unwrap } from "@/lib/bill-functions";
import { displayDate, totalsByCurrency, warrantyState } from "@/lib/bills";

export const Route = createFileRoute("/home")({
  beforeLoad: () => requireCurrentUser(),
  loader: async () => unwrap(await loadVault()),
  component: HomeScreen,
});

function HomeScreen() {
  const { bills, drafts, dueReminders } = Route.useLoaderData();
  const { user } = useUser();
  const today = format(new Date(), "yyyy-MM-dd");
  const active = bills.filter(
    (bill) => warrantyState(bill).status === "active",
  );
  const expiring = bills.filter(
    (bill) => warrantyState(bill).status === "ending",
  );
  const deadlines = bills
    .flatMap((bill) => [
      { bill, type: "Warranty", date: bill.warrantyExpiresAt },
      { bill, type: "Return", date: bill.returnExpiresAt },
    ])
    .filter((entry) => entry.date && entry.date >= today)
    .sort((a, b) => a.date!.localeCompare(b.date!))
    .slice(0, 5);
  const totals = totalsByCurrency(bills);
  const panel = "min-w-0 rounded-lg border border-border bg-card p-5 lg:p-6";
  return (
    <PhoneShell>
      <ScreenHeader
        eyebrow={format(new Date(), "EEEE, d MMMM")}
        title={
          user?.firstName ? `Hello, ${user.firstName}` : "Your day, covered"
        }
        description="A clear view of your purchases and the dates that matter."
        right={
          <div className="lg:hidden">
            <UserButton />
          </div>
        }
      />
      <div className="space-y-6 p-5 lg:p-8">
        <section
          aria-label="Bill actions"
          className="flex items-center justify-between gap-3"
        >
          <Link
            to="/scan"
            className="inline-flex min-h-11 items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            <ScanLine className="h-4 w-4 shrink-0" />
            Add a bill
          </Link>
          <span className="hidden text-xs text-muted-foreground sm:block">
            One receipt now. Less searching later.
          </span>
        </section>
        {drafts.length ? (
          <section
            aria-label="Bills in progress"
            className="rounded-lg border border-primary/20 bg-secondary/50 p-4 lg:p-5"
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <FileClock className="h-4 w-4 text-primary" />
                Bills in progress ({drafts.length})
              </h2>
              <Link to="/vault" className="text-xs font-semibold text-primary">
                View all
              </Link>
            </div>
            {drafts.slice(0, 3).map((draft) => (
              <Link
                to="/review/$documentId"
                params={{ documentId: draft.id }}
                key={draft.id}
                className="flex min-h-14 items-center gap-3 rounded-sm px-2 py-2 transition hover:bg-card/70"
              >
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-sm font-semibold"
                    title={draft.filename}
                  >
                    {draft.filename}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {draft.status === "pending"
                      ? "Upload incomplete"
                      : draft.status === "failed"
                        ? "Reading incomplete"
                        : draft.status === "processing"
                          ? "Reading in background"
                          : "Ready to review"}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">
                  Continue
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            ))}
          </section>
        ) : null}
        <section
          className="grid grid-cols-2 gap-3 xl:grid-cols-4"
          aria-label="Vault totals"
        >
          <Link
            to="/vault"
            className={`${panel} group transition hover:border-primary/40`}
          >
            <Wallet className="mb-3 h-5 w-5 text-primary" />
            <p className="text-xs text-muted-foreground">Bills saved</p>
            <p className="mt-1 text-2xl font-bold">{bills.length}</p>
          </Link>
          <Link
            to="/vault"
            search={{ status: "active" }}
            className={`${panel} transition hover:border-primary/40`}
          >
            <ShieldCheck className="mb-3 h-5 w-5 text-primary" />
            <p className="text-xs text-muted-foreground">Active warranties</p>
            <p className="mt-1 text-2xl font-bold">{active.length}</p>
          </Link>
          <Link
            to="/vault"
            search={{ status: "ending" }}
            className={`${panel} transition hover:border-primary/40`}
          >
            <CalendarDays className="mb-3 h-5 w-5 text-primary" />
            <p className="text-xs text-muted-foreground">Ending in 30 days</p>
            <p className="mt-1 text-2xl font-bold">{expiring.length}</p>
          </Link>
          <div className={panel}>
            <FileText className="mb-3 h-5 w-5 text-primary" />
            <p className="text-xs text-muted-foreground">Recorded value</p>
            <p className="mt-1 break-words text-lg font-bold">
              {totals.join(" / ") || "Not recorded"}
            </p>
          </div>
        </section>
        {dueReminders.length ? (
          <section className="rounded-lg border border-accent/40 bg-accent/10 p-5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Bell className="h-4 w-4" />
                Needs your attention
              </h2>
              <Link
                to="/reminders"
                className="text-xs font-semibold text-primary"
              >
                View all
              </Link>
            </div>
            {dueReminders.map((reminder) => (
              <Link
                to="/item/$itemId"
                params={{ itemId: reminder.itemId }}
                key={`${reminder.itemId}-${reminder.deadlineType}`}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold">
                    {reminder.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {reminder.deadlineType === "warranty"
                      ? "Warranty ending soon"
                      : "Return deadline approaching"}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0" />
              </Link>
            ))}
          </section>
        ) : null}
        <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
          <section className={panel}>
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Upcoming deadlines</h2>
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
            </div>
            {deadlines.length ? (
              <div className="divide-y divide-border">
                {deadlines.map(({ bill, type, date }) => {
                  const days = differenceInCalendarDays(
                    parseISO(date!),
                    new Date(),
                  );
                  return (
                    <Link
                      to="/item/$itemId"
                      params={{ itemId: bill.id }}
                      key={`${bill.id}-${type}`}
                      className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <span
                        className={`grid h-10 w-10 shrink-0 place-items-center rounded-sm ${days <= 7 ? "bg-accent/20" : "bg-secondary"}`}
                      >
                        <CalendarDays className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {bill.name}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {type} · {displayDate(date)}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 text-xs font-semibold ${days <= 7 ? "text-foreground" : "text-primary"}`}
                      >
                        {days === 0
                          ? "Today"
                          : days === 1
                            ? "Tomorrow"
                            : `In ${days} days`}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="py-5 text-center">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-secondary">
                  <Check className="h-5 w-5 text-primary" />
                </span>
                <p className="mt-3 text-sm font-semibold">
                  No upcoming deadlines recorded.
                </p>
                <p className="mx-auto mt-2 max-w-64 text-xs leading-relaxed text-muted-foreground">
                  Add a warranty or return date when reviewing a bill to see it
                  here.
                </p>
              </div>
            )}
          </section>
          <section className="min-w-0">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Recent bills</h2>
              <Link
                to="/vault"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary"
              >
                View vault
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            {bills.length ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {bills.slice(0, 4).map((bill) => (
                  <BillCard key={bill.id} bill={bill} />
                ))}
              </div>
            ) : (
              <div className={`${panel} py-8`}>
                <span className="mb-4 grid h-12 w-12 place-items-center rounded-sm bg-secondary">
                  <FileText className="h-6 w-6 text-primary" />
                </span>
                <p className="text-base font-semibold">Your vault is empty.</p>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  Start with one receipt. We’ll help you turn it into a purchase
                  record you can find again.
                </p>
                <ol className="mt-6 space-y-3">
                  {[
                    "Upload a photo or PDF",
                    "Check the extracted details",
                    "Save your bill and important dates",
                  ].map((step, i) => (
                    <li
                      key={step}
                      className="flex items-center gap-3 text-xs text-muted-foreground"
                    >
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border text-[10px] font-bold text-primary">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </section>
        </div>
      </div>
    </PhoneShell>
  );
}
