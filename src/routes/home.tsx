import { createFileRoute, Link } from "@tanstack/react-router";
import { UserButton, useUser } from "@clerk/tanstack-react-start";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  FileClock,
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
      <div className="space-y-6 p-5 lg:p-8">
        <section
          aria-label="Bill actions"
          className="flex items-center justify-between gap-3"
        >
          <Link
            to="/scan"
            className="inline-flex min-h-11 items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <ScanLine className="h-4 w-4 shrink-0" />
            Add a bill
          </Link>
        </section>
        {drafts.length ? (
          <section aria-label="Bills in progress">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold">
                Bills in progress ({drafts.length})
              </h2>
              <Link to="/vault" className="text-xs font-semibold text-primary">
                View all
              </Link>
            </div>
            <div className="divide-y divide-border border-y border-border">
              {drafts.slice(0, 3).map((draft) => (
                <Link
                  to="/review/$documentId"
                  params={{ documentId: draft.id }}
                  key={draft.id}
                  className="flex min-h-16 items-center gap-3 py-3"
                >
                  <FileClock className="h-5 w-5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-sm font-semibold"
                      title={draft.filename}
                    >
                      {draft.filename}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {draft.status === "pending"
                        ? "Upload incomplete"
                        : draft.status === "failed"
                          ? "Reading incomplete"
                          : draft.status === "processing"
                            ? "Reading in background"
                            : "Ready to review"}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0" />
                </Link>
              ))}
            </div>
          </section>
        ) : null}
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
        <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <section className="min-w-0">
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
                      <p className="break-words text-sm font-bold">
                        {bill.name}
                      </p>
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
          <section className="min-w-0">
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
              <div className="border-y border-border py-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Your vault is empty.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </PhoneShell>
  );
}
