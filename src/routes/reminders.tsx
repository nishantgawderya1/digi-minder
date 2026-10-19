import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
  LoaderCircle,
  Save,
  Settings2,
  X,
} from "lucide-react";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { PhoneShell, ScreenHeader } from "@/components/phone-shell";
import { requireCurrentUser } from "@/lib/route-auth";
import {
  loadNotifications,
  saveNotificationPreferences,
  actOnReminder,
} from "@/lib/notification-functions";
import { unwrap } from "@/lib/bill-functions";
import type { NotificationPreferences } from "@/lib/notifications";

export const Route = createFileRoute("/reminders")({
  beforeLoad: () => requireCurrentUser(),
  loader: async () => unwrap(await loadNotifications()),
  component: RemindersScreen,
});
function RemindersScreen() {
  const { preferences, records, emailConfigured } = Route.useLoaderData();
  const [settings, setSettings] =
    useState<NotificationPreferences>(preferences);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("upcoming");
  const router = useRouter();
  const now = Date.now();
  const isSnoozed = (record: (typeof records)[number]) =>
    Boolean(
      record.snoozedUntil && new Date(record.snoozedUntil).getTime() > now,
    );
  const upcoming = records.filter(
    (record) => record.status === "scheduled" && !isSnoozed(record),
  );
  const snoozed = records.filter(
    (record) => record.status === "scheduled" && isSnoozed(record),
  );
  const visible = [
    ...(tab === "all" ? records : tab === "snoozed" ? snoozed : upcoming),
  ].sort(
    (a, b) =>
      new Date(a.snoozedUntil || a.remindAt).getTime() -
      new Date(b.snoozedUntil || b.remindAt).getTime(),
  );
  const savedTimezone = preferences.timezone || "UTC";
  const today = parseISO(formatInTimeZone(now, savedTimezone, "yyyy-MM-dd"));
  const views = [
    { value: "upcoming", label: "Upcoming", count: upcoming.length },
    { value: "snoozed", label: "Snoozed", count: snoozed.length },
    { value: "all", label: "All", count: records.length },
  ];
  const timezone = settings.timezone || "UTC";
  const timezones = [
    ...new Set([
      timezone,
      "UTC",
      "Asia/Kolkata",
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...(typeof Intl.supportedValuesOf === "function"
        ? Intl.supportedValuesOf("timeZone")
        : []),
    ]),
  ];
  async function persist() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      unwrap(await saveNotificationPreferences({ data: settings }));
      await router.invalidate();
      setSaved(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Preferences couldn't be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function act(id: string, action: "dismiss" | "snooze", days = 1) {
    setBusy(true);
    setError(null);
    try {
      unwrap(await actOnReminder({ data: { id, action, days } }));
      await router.invalidate();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Reminder couldn't be updated.",
      );
    } finally {
      setBusy(false);
    }
  }
  const control =
    "mt-2 h-11 w-full min-w-0 rounded-xl border border-input bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
  return (
    <PhoneShell>
      <ScreenHeader
        eyebrow="Deadlines"
        title="Reminders"
        right={<Bell className="h-5 w-5 text-primary" />}
      />
      <div className="space-y-6 p-5 lg:p-8">
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary/15 bg-primary/5 p-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-card text-primary">
              <CalendarDays className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-bold">
                {upcoming.length
                  ? `${upcoming.length} upcoming ${upcoming.length === 1 ? "reminder" : "reminders"}`
                  : "Keep your next deadline in sight"}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Your warranty and return reminders, together in one place.
              </p>
            </div>
          </div>
          <Link
            to="/vault"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Manage bill deadlines
            <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
        {error ? (
          <p
            role="alert"
            className="rounded-xl bg-destructive/5 p-4 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
        <section aria-label="Your reminders" className="space-y-4">
          <div
            role="tablist"
            aria-label="Reminder views"
            className="flex gap-1 rounded-xl bg-secondary/60 p-1 sm:w-fit"
          >
            {views.map(({ value, label, count }, index) => (
              <button
                key={value}
                id={`reminders-tab-${value}`}
                type="button"
                role="tab"
                aria-selected={tab === value}
                aria-controls="reminders-panel"
                tabIndex={tab === value ? 0 : -1}
                onClick={() => setTab(value)}
                onKeyDown={(event) => {
                  const nextIndex =
                    event.key === "ArrowRight"
                      ? (index + 1) % views.length
                      : event.key === "ArrowLeft"
                        ? (index + views.length - 1) % views.length
                        : event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? views.length - 1
                            : null;
                  if (nextIndex === null) return;
                  event.preventDefault();
                  const next = views[nextIndex]!;
                  setTab(next.value);
                  document
                    .getElementById(`reminders-tab-${next.value}`)
                    ?.focus();
                }}
                className={`flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-2 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-primary sm:flex-none sm:gap-2 sm:px-4 sm:text-sm ${tab === value ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {label}
                <span aria-hidden="true" className="text-xs opacity-70">
                  {count}
                </span>
              </button>
            ))}
          </div>
          <div
            id="reminders-panel"
            role="tabpanel"
            aria-labelledby={`reminders-tab-${tab}`}
            className="space-y-3"
          >
            {visible.map((record) => {
              const reminderAt = new Date(
                record.snoozedUntil || record.remindAt,
              );
              const deadline =
                record.deadlineType === "warranty"
                  ? record.warrantyExpiresAt
                  : record.returnExpiresAt;
              const daysLeft = deadline
                ? differenceInCalendarDays(parseISO(deadline), today)
                : null;
              const due =
                record.status === "scheduled" && reminderAt.getTime() <= now;
              const status =
                record.status === "cancelled"
                  ? "Cancelled"
                  : record.status === "sent"
                    ? "Sent"
                    : record.status === "failed"
                      ? "Needs attention"
                      : isSnoozed(record)
                        ? "Snoozed"
                        : due
                          ? "Due now"
                          : "Scheduled";
              return (
                <article
                  key={record.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 sm:p-5"
                >
                  <div className="min-w-0 flex-1 basis-48">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground">
                        {record.deadlineType === "warranty"
                          ? "Warranty"
                          : "Return"}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${due || record.status === "failed" ? "bg-accent/15 text-foreground" : "bg-secondary text-muted-foreground"}`}
                      >
                        {status}
                      </span>
                    </div>
                    <Link
                      to="/item/$itemId"
                      params={{ itemId: record.itemId }}
                      className="break-words text-sm font-bold underline-offset-4 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      {record.name}
                    </Link>
                    {deadline ? (
                      <p className="mt-1 text-sm">
                        {record.deadlineType === "warranty"
                          ? "Coverage ends"
                          : "Return by"}{" "}
                        <time dateTime={deadline}>
                          {format(parseISO(deadline), "d MMM yyyy")}
                        </time>
                        <span className="text-muted-foreground">
                          {daysLeft === 0
                            ? " · today"
                            : daysLeft !== null && daysLeft > 0
                              ? ` · in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}`
                              : " · deadline passed"}
                        </span>
                      </p>
                    ) : null}
                    <p className="mt-2 flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
                      <Clock className="mr-1 h-3.5 w-3.5" />
                      {isSnoozed(record) && record.status === "scheduled"
                        ? "Snoozed until"
                        : "Reminder"}{" "}
                      <time dateTime={reminderAt.toISOString()}>
                        {formatInTimeZone(
                          reminderAt,
                          savedTimezone,
                          "d MMM yyyy 'at' HH:mm",
                        )}
                      </time>
                    </p>
                  </div>
                  {record.status === "scheduled" ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <select
                        aria-label={`Snooze ${record.name}`}
                        value=""
                        disabled={busy}
                        onChange={(event) =>
                          void act(
                            record.id,
                            "snooze",
                            Number(event.target.value),
                          )
                        }
                        className="h-11 max-w-36 rounded-xl border border-input bg-card px-3 text-xs focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
                      >
                        <option value="" disabled>
                          Snooze
                        </option>
                        <option value="1">1 day</option>
                        <option value="3">3 days</option>
                        <option value="7">7 days</option>
                      </select>
                      <button
                        type="button"
                        title="Dismiss reminder"
                        aria-label={`Dismiss ${record.name}`}
                        disabled={busy}
                        onClick={() => void act(record.id, "dismiss")}
                        className="grid h-11 w-11 place-items-center rounded-xl border border-border text-muted-foreground transition hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
            {!visible.length ? (
              <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-10 text-center">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-secondary/70 text-primary">
                  <Bell className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-base font-bold">
                  {!records.length
                    ? "Your deadlines start here"
                    : tab === "snoozed"
                      ? "Nothing snoozed"
                      : tab === "all"
                        ? "Your deadlines start here"
                        : "You're all caught up"}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  No reminders in this view.
                </p>
                <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                  {tab === "snoozed"
                    ? "Snooze a reminder when you need more time. It will appear here until it's due again."
                    : "Add a warranty or return date and choose reminder lead times on a saved bill."}
                </p>
                <Link
                  to="/vault"
                  className="mt-5 inline-flex min-h-11 items-center gap-2 font-semibold text-primary"
                >
                  View your bills <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ) : null}
          </div>
          {visible.length ? (
            <p className="text-xs text-muted-foreground">
              Reminder times shown in {savedTimezone}.
            </p>
          ) : null}
        </section>
        <details
          open={records.length === 0}
          className="group rounded-2xl border border-border bg-card"
        >
          <summary
            aria-label="Reminder settings"
            className="flex min-h-16 cursor-pointer list-none items-center gap-3 rounded-2xl p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:p-5 [&::-webkit-details-marker]:hidden"
          >
            <Settings2 className="h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <span className="text-sm font-bold">Reminder settings</span>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {emailConfigured && preferences.emailReminders
                  ? "Email enabled"
                  : "In-app reminders"}
                {" · "}
                {savedTimezone}
              </p>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition group-open:rotate-180" />
          </summary>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void persist();
            }}
            className="space-y-4 border-t border-border p-4 sm:p-5"
          >
            <label className="flex items-center gap-3 text-sm font-semibold">
              <input
                type="checkbox"
                checked={settings.emailReminders}
                disabled={!emailConfigured || busy}
                onChange={(event) => {
                  setSaved(false);
                  setSettings({
                    ...settings,
                    emailReminders: event.target.checked,
                  });
                }}
                className="h-4 w-4 accent-primary"
              />
              Email reminders
            </label>
            <p className="text-xs text-muted-foreground">
              {emailConfigured
                ? preferences.email
                  ? `Send to ${preferences.email}`
                  : "Send to your verified account email"
                : "Email reminders are currently unavailable. Your reminders are still available here in the app."}
            </p>
            <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
              <label className="min-w-0 text-xs font-semibold">
                Timezone
                <select
                  aria-label="Reminder timezone"
                  className={control}
                  value={settings.timezone}
                  onChange={(event) => {
                    setSaved(false);
                    setSettings({ ...settings, timezone: event.target.value });
                  }}
                >
                  {timezones.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold">
                Reminder time
                <select
                  aria-label="Reminder time"
                  className={control}
                  value={settings.reminderHour}
                  onChange={(event) => {
                    setSaved(false);
                    setSettings({
                      ...settings,
                      reminderHour: Number(event.target.value),
                    });
                  }}
                >
                  {Array.from({ length: 24 }, (_, hour) => (
                    <option key={hour} value={hour}>
                      {String(hour).padStart(2, "0")}:00
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              disabled={busy}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
            >
              {busy ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : saved ? (
                <Check className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saved ? "Saved" : "Save preferences"}
            </button>
          </form>
        </details>
      </div>
    </PhoneShell>
  );
}
