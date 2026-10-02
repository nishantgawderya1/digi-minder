import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Bell, Check, Clock, LoaderCircle, Save, X } from "lucide-react";
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
  const visible = records.filter(
    (record) =>
      tab === "all" ||
      (record.status === "scheduled" &&
        (tab === "snoozed"
          ? record.snoozedUntil && new Date(record.snoozedUntil).getTime() > now
          : !record.snoozedUntil ||
            new Date(record.snoozedUntil).getTime() <= now)),
  );
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
    "mt-2 h-11 w-full min-w-0 rounded-sm border border-input bg-card px-3 text-sm";
  return (
    <PhoneShell>
      <ScreenHeader
        eyebrow="Deadlines"
        title="Reminders"
        right={<Bell className="h-5 w-5 text-primary" />}
      />
      <div className="space-y-6 p-5 lg:p-8">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void persist();
          }}
          className="space-y-4 border-b border-border pb-6"
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
              : "Email reminders are currently unavailable."}
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
            className="inline-flex h-11 items-center gap-2 rounded-sm bg-primary px-4 text-sm font-bold text-primary-foreground"
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
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div
          role="tablist"
          aria-label="Reminder views"
          className="flex border-b border-border"
        >
          {[
            ["upcoming", "Upcoming"],
            ["snoozed", "Snoozed"],
            ["all", "All"],
          ].map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value!)}
              className={`min-h-11 px-4 text-sm font-semibold ${tab === value ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="divide-y divide-border">
          {visible.map((record) => (
            <article
              key={record.id}
              className="flex flex-wrap items-center justify-between gap-3 py-4"
            >
              <div className="min-w-0">
                <Link
                  to="/item/$itemId"
                  params={{ itemId: record.itemId }}
                  className="break-words text-sm font-bold"
                >
                  {record.name}
                </Link>
                <p className="mt-1 text-xs text-muted-foreground">
                  {record.deadlineType === "warranty" ? "Warranty" : "Return"}{" "}
                  reminder ·{" "}
                  {formatInTimeZone(
                    new Date(record.snoozedUntil || record.remindAt),
                    preferences.timezone,
                    "d MMM yyyy, HH:mm",
                  )}
                  {record.status === "cancelled" ? " · Cancelled" : ""}
                </p>
              </div>
              {record.status === "scheduled" ? (
                <div className="flex shrink-0 items-center gap-2">
                  <select
                    aria-label={`Snooze ${record.name}`}
                    value=""
                    disabled={busy}
                    onChange={(event) =>
                      void act(record.id, "snooze", Number(event.target.value))
                    }
                    className="h-10 max-w-36 rounded-sm border border-input bg-card px-2 text-xs"
                  >
                    <option value="" disabled>
                      Snooze
                    </option>
                    <option value="1">1 day</option>
                    <option value="3">3 days</option>
                    <option value="7">7 days</option>
                  </select>
                  <button
                    title="Dismiss reminder"
                    aria-label={`Dismiss ${record.name}`}
                    disabled={busy}
                    onClick={() => void act(record.id, "dismiss")}
                    className="grid h-10 w-10 place-items-center rounded-sm border border-border"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <Clock className="h-4 w-4 text-muted-foreground" />
              )}
            </article>
          ))}
          {!visible.length ? (
            <p className="py-8 text-sm text-muted-foreground">
              No reminders in this view.
            </p>
          ) : null}
        </div>
      </div>
    </PhoneShell>
  );
}
