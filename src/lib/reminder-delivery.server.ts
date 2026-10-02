import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { Resend } from "resend";
import { getDatabase } from "@/db/index.server";
import { appUsers, items, reminders } from "@/db/schema";
import { emailConfigured } from "./notification-service.server";
import { displayDate } from "./bills";
import { clerkClient } from "@clerk/tanstack-react-start/server";

export async function dueEmailIds() {
  if (!emailConfigured()) return [];
  const rows = await getDatabase()
    .select({ id: reminders.id })
    .from(reminders)
    .innerJoin(appUsers, eq(appUsers.id, reminders.userId))
    .innerJoin(
      items,
      and(eq(items.id, reminders.itemId), eq(items.userId, reminders.userId)),
    )
    .where(
      and(
        eq(reminders.channel, "email"),
        eq(reminders.status, "scheduled"),
        eq(appUsers.emailReminders, true),
        sql`coalesce(${reminders.snoozedUntil},${reminders.remindAt}) <= now()`,
        sql`${reminders.deliveryLeaseUntil} IS NULL OR ${reminders.deliveryLeaseUntil} < now()`,
        sql`CASE WHEN ${reminders.deadlineType} = 'warranty' THEN ${items.warrantyExpiresAt} ELSE ${items.returnExpiresAt} END >= (now() AT TIME ZONE ${appUsers.timezone})::date`,
      ),
    )
    .orderBy(asc(reminders.remindAt))
    .limit(50);
  return rows.map((row) => row.id);
}

export async function deliverReminder(id: string) {
  if (!emailConfigured()) return { status: "unconfigured" };
  const db = getDatabase();
  const [entry] = await db
    .select({ reminder: reminders, user: appUsers, bill: items })
    .from(reminders)
    .innerJoin(appUsers, eq(appUsers.id, reminders.userId))
    .innerJoin(
      items,
      and(eq(items.id, reminders.itemId), eq(items.userId, reminders.userId)),
    )
    .where(
      and(
        eq(reminders.id, id),
        eq(reminders.channel, "email"),
        eq(reminders.status, "scheduled"),
        eq(appUsers.emailReminders, true),
        sql`coalesce(${reminders.snoozedUntil},${reminders.remindAt}) <= now()`,
        sql`CASE WHEN ${reminders.deadlineType} = 'warranty' THEN ${items.warrantyExpiresAt} ELSE ${items.returnExpiresAt} END >= (now() AT TIME ZONE ${appUsers.timezone})::date`,
      ),
    );
  if (!entry || !entry.user.email) return { status: "skipped" };
  const account = await clerkClient().users.getUser(entry.user.id);
  const address = account.emailAddresses.find(
    (value) =>
      value.id === account.primaryEmailAddressId &&
      value.verification?.status === "verified",
  );
  if (address?.emailAddress !== entry.user.email) return { status: "skipped" };
  // The provider remembers idempotency keys for 24 hours. Never retry an ambiguous send beyond that window.
  if (
    entry.reminder.deliveryStartedAt &&
    Date.now() - entry.reminder.deliveryStartedAt.getTime() >= 23 * 3600000
  ) {
    await db
      .update(reminders)
      .set({
        status: "failed",
        deliveryError:
          "Delivery could not be confirmed within the retry window.",
      })
      .where(and(eq(reminders.id, id), eq(reminders.status, "scheduled")));
    return { status: "failed" };
  }
  const expiry =
    entry.reminder.deadlineType === "warranty"
      ? entry.bill.warrantyExpiresAt
      : entry.bill.returnExpiresAt;
  const label =
    entry.reminder.deadlineType === "warranty" ? "Warranty" : "Return";
  const origin = new URL(process.env["APP_BASE_URL"]!).origin;
  const payload = entry.reminder.deliveryPayload ?? {
    from: process.env["REMINDER_FROM_EMAIL"]!,
    to: entry.user.email,
    subject: `${label} reminder: ${entry.bill.name.replace(/[\r\n]+/g, " ")}`,
    text: `${entry.bill.name}\n${label} deadline: ${displayDate(expiry)}\n${entry.bill.retailer ? `Retailer: ${entry.bill.retailer}\n` : ""}\nView your saved bill: ${origin}/item/${entry.bill.id}\n\nManage reminders: ${origin}/reminders`,
  };
  if (payload.to !== address.emailAddress) {
    await db
      .update(reminders)
      .set({
        status: "cancelled",
        deliveryError: "The verified recipient changed.",
      })
      .where(and(eq(reminders.id, id), eq(reminders.status, "scheduled")));
    return { status: "skipped" };
  }
  const token = randomUUID();
  const [claimed] = await db
    .update(reminders)
    .set({
      deliveryToken: token,
      deliveryLeaseUntil: new Date(Date.now() + 90000),
      deliveryStartedAt: sql`coalesce(${reminders.deliveryStartedAt}, now())`,
      deliveryAttempts: sql`${reminders.deliveryAttempts}+1`,
      deliveryPayload: payload,
    })
    .where(
      and(
        eq(reminders.id, id),
        eq(reminders.status, "scheduled"),
        sql`coalesce(${reminders.snoozedUntil},${reminders.remindAt}) <= now()`,
        sql`EXISTS (SELECT 1 FROM ${appUsers} WHERE ${appUsers.id} = ${reminders.userId} AND ${appUsers.emailReminders} = true AND ${appUsers.email} = ${address.emailAddress})`,
        sql`${reminders.deliveryAttempts} < 5`,
        sql`${reminders.deliveryLeaseUntil} IS NULL OR ${reminders.deliveryLeaseUntil} < now()`,
      ),
    )
    .returning();
  if (!claimed) return { status: "busy" };
  try {
    const client = new Resend(process.env["RESEND_API_KEY"]!);
    const result = await client.emails.send(payload, {
      idempotencyKey: `warrantly-reminder/${id}`,
      signal: AbortSignal.timeout(20000),
    });
    if (result.error || !result.data?.id)
      throw new Error("Email provider rejected the reminder.");
    await db
      .update(reminders)
      .set({
        status: "sent",
        sentAt: new Date(),
        providerMessageId: result.data.id,
        deliveryError: null,
        deliveryLeaseUntil: null,
      })
      .where(and(eq(reminders.id, id), eq(reminders.deliveryToken, token)));
    return { status: "sent" };
  } catch {
    await db
      .update(reminders)
      .set({
        status: claimed.deliveryAttempts >= 5 ? "failed" : "scheduled",
        deliveryError: "Email delivery failed; retry pending.",
        deliveryLeaseUntil: null,
      })
      .where(
        and(
          eq(reminders.id, id),
          eq(reminders.deliveryToken, token),
          eq(reminders.status, "scheduled"),
        ),
      );
    throw new Error("Reminder delivery failed.");
  }
}
