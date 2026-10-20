import { and, eq, sql } from "drizzle-orm";
import { Resend } from "resend";
import { getDatabase } from "@/db/index.server";
import { appUsers, items } from "@/db/schema";
import { displayDate } from "./bills";
import { emailConfigured } from "./notification-service.server";
import { welcomeEmail } from "./welcome-email";
import { reminderEmail } from "./reminder-email";

// Admin-only Inngest previews use the configured test inbox, never an event-supplied recipient.
// They don't touch the signup ledger or scheduled reminders.
export async function prepareEmailPreviews(itemId: string) {
  const to = process.env["EMAIL_TEST_RECIPIENT"]?.trim().toLowerCase();
  if (!emailConfigured() || !to)
    throw new Error("Email test mode is required.");
  const [bill] = await getDatabase()
    .select({ item: items })
    .from(items)
    .innerJoin(appUsers, eq(appUsers.id, items.userId))
    .where(and(eq(items.id, itemId), sql`lower(${appUsers.email}) = ${to}`));
  if (!bill?.item.warrantyExpiresAt)
    throw new Error("The test inbox must own a bill with a warranty deadline.");
  const from = process.env["REMINDER_FROM_EMAIL"]!;
  const baseUrl = process.env["APP_BASE_URL"]!;
  const welcome = welcomeEmail(from, to, baseUrl);
  const reminder = reminderEmail({
    from,
    to,
    baseUrl,
    label: "Warranty",
    name: bill.item.name,
    deadline: displayDate(bill.item.warrantyExpiresAt),
    retailer: bill.item.retailer,
    itemId,
  });
  return {
    preparedAt: Date.now(),
    welcome: { ...welcome, subject: `${welcome.subject} [design preview]` },
    reminder: { ...reminder, subject: `${reminder.subject} [design preview]` },
  };
}

export async function deliverEmailPreview(
  payload: Awaited<ReturnType<typeof prepareEmailPreviews>>["reminder"],
  idempotencyKey: string,
  preparedAt: number,
) {
  const to = process.env["EMAIL_TEST_RECIPIENT"]?.trim().toLowerCase();
  if (!emailConfigured() || !to || payload.to !== to)
    throw new Error("Email test recipient changed or testing is disabled.");
  if (Date.now() - preparedAt >= 23 * 3600000)
    throw new Error("Preview retry window expired.");
  const result = await new Resend(process.env["RESEND_API_KEY"]!).emails.send(
    payload,
    { idempotencyKey, signal: AbortSignal.timeout(20000) },
  );
  if (result.error || !result.data?.id)
    throw new Error("Preview email delivery failed.");
  return { providerMessageId: result.data.id };
}
