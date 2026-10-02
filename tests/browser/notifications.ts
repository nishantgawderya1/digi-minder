import type { NotificationPreferences } from "@/lib/notifications";
const ok = <T>(data: T) => ({ ok: true as const, data });
const preferences = () =>
  JSON.parse(
    sessionStorage.getItem("test-preferences") ||
      '{"emailReminders":false,"timezone":"UTC","reminderHour":9,"email":null}',
  );
const records = () =>
  JSON.parse(sessionStorage.getItem("test-reminders") || "[]");
export const loadNotifications = async () =>
  ok({ preferences: preferences(), records: records(), emailConfigured: true });
export const saveNotificationPreferences = async ({
  data,
}: {
  data: NotificationPreferences;
}) => {
  sessionStorage.setItem(
    "test-preferences",
    JSON.stringify({ ...data, email: "owner@example.invalid" }),
  );
  return ok(data);
};
export const actOnReminder = async ({
  data,
}: {
  data: { id: string; action: "snooze" | "dismiss"; days: number };
}) => {
  const updated = records().map((record: { id: string }) =>
    record.id === data.id
      ? {
          ...record,
          ...(data.action === "dismiss"
            ? { status: "cancelled" }
            : {
                snoozedUntil: new Date(
                  Date.now() + data.days * 86400000,
                ).toISOString(),
              }),
        }
      : record,
  );
  sessionStorage.setItem("test-reminders", JSON.stringify(updated));
  return ok({ id: data.id });
};
