import { createFileRoute, Link } from "@tanstack/react-router";
import { UserButton, useUser } from "@clerk/tanstack-react-start";
import {
  ArrowRight,
  Bell,
  Bot,
  CalendarDays,
  Plus,
  ScanLine,
} from "lucide-react";
import { format } from "date-fns";
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
  const active = bills.filter((bill) =>
    ["active", "ending"].includes(warrantyState(bill).status),
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
    .slice(0, 6);
  const totals = totalsByCurrency(bills);
  return (
    <PhoneShell>
      <ScreenHeader
        eyebrow={format(new Date(), "EEEE, d MMMM")}
        title={
          user?.firstName ? `Hello, ${user.firstName}` : "Your day, covered"
        }
        right={
          <div className="lg:hidden">
            <UserButton />
          </div>
        }
      />
      <div className="space-y-8 p-5 lg:p-8">
        <section aria-label="Quick actions" className="grid grid-cols-2 gap-3">
          <Link
            to="/scan"
            className="flex min-h-24 min-w-0 items-center gap-3 rounded-sm border border-primary bg-primary px-4 py-4 font-bold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <ScanLine className="h-6 w-6 shrink-0" />
            <span className="break-words text-sm">Scan a bill</span>
          </Link>
          <Link
            to="/agent"
            className="flex min-h-24 min-w-0 items-center gap-3 rounded-sm border border-border bg-card px-4 py-4 font-bold transition hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <Bot className="h-6 w-6 shrink-0 text-primary" />
            <span className="break-words text-sm">Ask assistant</span>
          </Link>
        </section>
        <section
          className="grid grid-cols-2 gap-x-5 gap-y-6 border-b border-border pb-6 xl:grid-cols-4"
          aria-label="Vault totals"
        >
          {[
            ["Bills saved", String(bills.length)],
            ["Recorded value", totals.join(" / ") || "Not recorded"],
            ["Active warranties", String(active.length)],
            ["Ending in 30 days", String(expiring.length)],
          ].map(([label, value]) => (
            <div className="min-w-0" key={label}>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-2 break-words text-xl font-extrabold">{value}</p>
            </div>
          ))}
        </section>
        {drafts.length ? (
          <Link
            to="/vault"
            className="flex items-center justify-between gap-3 border-l-4 border-accent bg-secondary px-4 py-3 text-sm font-semibold"
          >
            {drafts.length} {drafts.length === 1 ? "bill needs" : "bills need"}{" "}
            review
            <ArrowRight className="h-4 w-4 shrink-0" />
          </Link>
        ) : null}
        {dueReminders.length ? (
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
              <Bell className="h-5 w-5 text-primary" />
              Reminders
              <Link
                to="/reminders"
                className="ml-auto text-xs font-semibold text-primary"
              >
                View all
              </Link>
            </h2>
            <div className="divide-y divide-border border-y border-border">
              {dueReminders.map((reminder) => (
                <Link
                  to="/item/$itemId"
                  params={{ itemId: reminder.itemId }}
                  key={`${reminder.itemId}-${reminder.deadlineType}`}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="break-words text-sm font-bold">
                      {reminder.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {reminder.deadlineType === "warranty"
                        ? "Warranty ending soon"
                        : "Return deadline approaching"}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0" />
                </Link>
              ))}
            </div>
          </section>
        ) : null}
        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold">Upcoming deadlines</h2>
            <CalendarDays className="h-5 w-5 text-primary" />
          </div>
          {deadlines.length ? (
            <div className="divide-y divide-border border-y border-border">
              {deadlines.map(({ bill, type, date }) => (
                <Link
                  key={`${bill.id}-${type}`}
                  to="/item/$itemId"
                  params={{ itemId: bill.id }}
                  className="flex flex-wrap items-center justify-between gap-3 py-4"
                >
                  <div className="min-w-0">
                    <p className="break-words text-sm font-bold">{bill.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {type} deadline
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-primary">
                    {displayDate(date)}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="border-y border-border py-6 text-sm text-muted-foreground">
              No upcoming deadlines recorded.
            </p>
          )}
        </section>
        <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">Recent bills</h2>
            <Link
              to="/vault"
              className="inline-flex items-center gap-1 text-xs font-bold text-primary"
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
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">
                Your vault is empty.
              </p>
              <Link
                to="/scan"
                className="mt-4 inline-flex items-center gap-2 rounded-sm bg-primary px-5 py-3 text-sm font-bold text-primary-foreground"
              >
                <Plus className="h-4 w-4" />
                Add your first bill
              </Link>
            </div>
          )}
        </section>
      </div>
    </PhoneShell>
  );
}
