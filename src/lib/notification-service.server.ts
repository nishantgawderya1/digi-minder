import { and, asc, eq, sql } from "drizzle-orm";
import { clerkClient } from "@clerk/tanstack-react-start/server";
import { getDatabase } from "@/db/index.server";
import { appUsers, items, reminders } from "@/db/schema";
import { getAuthenticatedUserId } from "./auth.server";
import { billFieldsSchema } from "./bills";
import {
  notificationPreferencesSchema,
  reminderActionSchema,
  scheduleInTimezone,
  type NotificationPreferences,
} from "./notifications";
import { serviceResult, ServiceError } from "./service-error.server";

export const emailConfigured = () =>
  Boolean(
    process.env["RESEND_API_KEY"] &&
    process.env["REMINDER_FROM_EMAIL"] &&
    process.env["APP_BASE_URL"],
  );
const preferenceColumns = {
  emailReminders: appUsers.emailReminders,
  timezone: appUsers.timezone,
  reminderHour: appUsers.reminderHour,
  email: appUsers.email,
};
export async function loadNotifications() {
  const userId = await getAuthenticatedUserId();
  return serviceResult(async () => {
    const [preferences] = await getDatabase()
      .select(preferenceColumns)
      .from(appUsers)
      .where(eq(appUsers.id, userId));
    const records = await getDatabase()
      .select({
        id: reminders.id,
        itemId: reminders.itemId,
        name: items.name,
        deadlineType: reminders.deadlineType,
        remindAt: reminders.remindAt,
        snoozedUntil: reminders.snoozedUntil,
        status: reminders.status,
        warrantyExpiresAt: items.warrantyExpiresAt,
        returnExpiresAt: items.returnExpiresAt,
      })
      .from(reminders)
      .innerJoin(
        items,
        and(eq(items.id, reminders.itemId), eq(items.userId, reminders.userId)),
      )
      .where(and(eq(reminders.userId, userId), eq(reminders.channel, "in_app")))
      .orderBy(asc(reminders.remindAt))
      .limit(200);
    return {
      preferences: preferences!,
      records,
      emailConfigured: emailConfigured(),
    };
  });
}

export async function saveNotificationPreferences(
  input: NotificationPreferences,
) {
  const userId = await getAuthenticatedUserId();
  return serviceResult(async () => {
    const data = notificationPreferencesSchema.parse(input);
    let email: string | null = null;
    if (data.emailReminders) {
      if (!emailConfigured())
        throw new ServiceError("Email delivery hasn't been connected yet.");
      const user = await clerkClient().users.getUser(userId);
      const primary = user.emailAddresses.find(
        (address) =>
          address.id === user.primaryEmailAddressId &&
          address.verification?.status === "verified",
      );
      if (!primary)
        throw new ServiceError(
          "Verify your primary account email before enabling reminders.",
        );
      email = primary.emailAddress;
    }
    const db = getDatabase();
    const [previous] = await db
      .select(preferenceColumns)
      .from(appUsers)
      .where(eq(appUsers.id, userId));
    const clockChanged =
      previous?.timezone !== data.timezone ||
      previous?.reminderHour !== data.reminderHour;
    const emailChanged = previous?.emailReminders !== data.emailReminders;
    const bills = await db.select().from(items).where(eq(items.userId, userId));
    await db.batch([
      db
        .update(appUsers)
        .set({ ...data, email, updatedAt: new Date() })
        .where(eq(appUsers.id, userId)),
      db
        .update(reminders)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(reminders.userId, userId),
            eq(reminders.status, "scheduled"),
            sql`${clockChanged} OR (${reminders.channel} = 'email' AND ${emailChanged})`,
          ),
        ),
      ...bills.flatMap((bill) => {
        const schedule = scheduleInTimezone(
          billFieldsSchema.strip().parse(bill),
          data,
        )
          .filter(
            (row) => clockChanged || (emailChanged && row.channel === "email"),
          )
          .map((row) => ({ ...row, userId, itemId: bill.id }));
        return schedule.length
          ? [
              db
                .insert(reminders)
                .values(schedule)
                .onConflictDoUpdate({
                  target: [
                    reminders.userId,
                    reminders.itemId,
                    reminders.deadlineType,
                    reminders.remindAt,
                    reminders.channel,
                  ],
                  set: { status: "scheduled", snoozedUntil: null },
                  setWhere: sql`${reminders.sentAt} IS NULL AND ${reminders.deliveryStartedAt} IS NULL`,
                }),
            ]
          : [];
      }),
    ]);
    return { ...data, email };
  });
}

export async function actOnReminder(input: {
  id: string;
  action: "dismiss" | "snooze";
  days: number;
}) {
  const userId = await getAuthenticatedUserId();
  return serviceResult(async () => {
    const data = reminderActionSchema.parse(input);
    const [notice] = await getDatabase()
      .select()
      .from(reminders)
      .where(
        and(
          eq(reminders.id, data.id),
          eq(reminders.userId, userId),
          eq(reminders.channel, "in_app"),
          eq(reminders.status, "scheduled"),
        ),
      );
    if (!notice) throw new ServiceError("Reminder not found.");
    await getDatabase()
      .update(reminders)
      .set(
        data.action === "dismiss"
          ? { status: "cancelled" }
          : {
              snoozedUntil: new Date(
                Math.max(
                  Date.now(),
                  (notice.snoozedUntil || notice.remindAt).getTime(),
                ) +
                  data.days * 86400000,
              ),
            },
      )
      .where(
        and(
          eq(reminders.userId, userId),
          eq(reminders.itemId, notice.itemId),
          eq(reminders.deadlineType, notice.deadlineType),
          eq(reminders.status, "scheduled"),
          sql`${reminders.remindAt} <= ${notice.remindAt}`,
        ),
      );
    return { id: data.id };
  });
}
