import { z } from "zod";
import { format, addDays, parseISO } from "date-fns";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import type { BillFields } from "./bills";

export const notificationPreferencesSchema = z.object({
  emailReminders: z.boolean(),
  timezone: z
    .string()
    .max(100)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, "Choose a valid timezone."),
  reminderHour: z.number().int().min(0).max(23),
});
export type NotificationPreferences = z.infer<
  typeof notificationPreferencesSchema
>;
export const reminderActionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["dismiss", "snooze"]),
  days: z.number().int().min(1).max(7).default(1),
});

export function scheduleInTimezone(
  fields: BillFields,
  preferences: NotificationPreferences,
  today = new Date(),
) {
  const scheduled: {
    deadlineType: "warranty" | "return";
    remindAt: Date;
    channel: "in_app" | "email";
  }[] = [];
  for (const [deadlineType, expiry] of [
    ["warranty", fields.warrantyExpiresAt],
    ["return", fields.returnExpiresAt],
  ] as const) {
    if (!expiry) continue;
    for (const days of new Set(fields.reminderDays)) {
      const date = format(addDays(parseISO(expiry), -days), "yyyy-MM-dd");
      const remindAt = fromZonedTime(
        `${date}T${String(preferences.reminderHour).padStart(2, "0")}:00:00`,
        preferences.timezone,
      );
      if (remindAt <= today) continue;
      scheduled.push({ deadlineType, remindAt, channel: "in_app" });
      if (preferences.emailReminders)
        scheduled.push({ deadlineType, remindAt, channel: "email" });
    }
  }
  return scheduled;
}
export const dateInTimezone = (date: Date, timezone: string) =>
  formatInTimeZone(date, timezone, "yyyy-MM-dd");
