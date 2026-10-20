import { and, asc, eq, sql } from "drizzle-orm";
import { clerkClient } from "@clerk/tanstack-react-start/server";
import { Resend } from "resend";
import { getDatabase } from "@/db/index.server";
import { appUsers } from "@/db/schema";
import { emailConfigured } from "./notification-service.server";
import { welcomeEmail } from "./welcome-email";

const available = () =>
  and(
    eq(appUsers.welcomeStatus, "pending"),
    sql`${appUsers.welcomeAttempts} < 5`,
    sql`(${appUsers.welcomeLeaseUntil} IS NULL OR ${appUsers.welcomeLeaseUntil} < now())`,
  );

export async function pendingWelcomeUserIds() {
  if (!emailConfigured()) return [];
  const rows = await getDatabase()
    .select({ id: appUsers.id })
    .from(appUsers)
    .where(available())
    .orderBy(asc(appUsers.createdAt))
    .limit(50);
  return rows.map((row) => row.id);
}

export async function deliverWelcome(userId: string) {
  if (!emailConfigured()) return { status: "unconfigured" };
  const db = getDatabase();
  // Claim before external calls: repeated sign-ins and overlapping workers cannot
  // send again. Pending state is persisted by the account insert itself.
  const [user] = await db
    .update(appUsers)
    .set({
      welcomeLeaseUntil: new Date(Date.now() + 90000),
      welcomeAttempts: sql`${appUsers.welcomeAttempts} + 1`,
    })
    .where(and(eq(appUsers.id, userId), available()))
    .returning();
  if (!user) return { status: "skipped" };
  const claim = and(
    eq(appUsers.id, userId),
    eq(appUsers.welcomeStatus, "pending"),
    eq(appUsers.welcomeAttempts, user.welcomeAttempts),
  );
  const stop = async (status: "skipped" | "failed", error: string) => {
    await db
      .update(appUsers)
      .set({
        welcomeStatus: status,
        welcomeLeaseUntil: null,
        welcomeError: error,
      })
      .where(claim);
    return { status };
  };
  try {
    // Resend retains idempotency keys for 24h. Do not resend an ambiguous
    // delivery after that window, even if the scheduler was offline.
    if (
      user.welcomeStartedAt &&
      Date.now() - user.welcomeStartedAt.getTime() >= 23 * 3600000
    )
      return await stop(
        "failed",
        "Delivery could not be confirmed within the retry window.",
      );
    const account = await clerkClient().users.getUser(userId);
    const primary = account.emailAddresses.find(
      (entry) =>
        entry.id === account.primaryEmailAddressId &&
        entry.verification?.status === "verified",
    );
    if (!primary) throw new Error("No verified primary email yet.");
    const testRecipient = process.env["EMAIL_TEST_RECIPIENT"]
      ?.trim()
      .toLowerCase();
    if (testRecipient && primary.emailAddress.toLowerCase() !== testRecipient)
      return await stop(
        "skipped",
        "Email testing is restricted to the configured recipient.",
      );
    if (user.welcomePayload && user.welcomePayload.to !== primary.emailAddress)
      return await stop("skipped", "The verified recipient changed.");
    const payload =
      user.welcomePayload ??
      welcomeEmail(
        process.env["REMINDER_FROM_EMAIL"]!,
        primary.emailAddress,
        process.env["APP_BASE_URL"]!,
      );
    const [prepared] = await db
      .update(appUsers)
      .set({
        welcomePayload: payload,
        welcomeStartedAt: sql`coalesce(${appUsers.welcomeStartedAt}, now())`,
      })
      .where(claim)
      .returning({ id: appUsers.id });
    if (!prepared) return { status: "skipped" };
    const result = await new Resend(process.env["RESEND_API_KEY"]!).emails.send(
      payload,
      {
        idempotencyKey: `warrantly-welcome/${userId}`,
        signal: AbortSignal.timeout(20000),
      },
    );
    if (result.error || !result.data?.id)
      throw new Error("Email provider rejected the welcome email.");
    await db
      .update(appUsers)
      .set({
        welcomeStatus: "sent",
        welcomeSentAt: new Date(),
        welcomeProviderId: result.data.id,
        welcomeError: null,
        welcomeLeaseUntil: null,
      })
      .where(claim);
    return { status: "sent" };
  } catch {
    await db
      .update(appUsers)
      .set({
        welcomeStatus: user.welcomeAttempts >= 5 ? "failed" : "pending",
        welcomeError:
          user.welcomeAttempts >= 5
            ? "Welcome email delivery failed."
            : "Welcome email delivery failed; retry pending.",
        welcomeLeaseUntil: null,
      })
      .where(claim);
    throw new Error("Welcome email delivery failed.");
  }
}
