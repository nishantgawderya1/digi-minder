import { and, desc, eq, sql } from "drizzle-orm";
import { getDatabase } from "@/db/index.server";
import { appUsers, items } from "@/db/schema";
import { getAuthenticatedUserId } from "./auth.server";
import { assistantRequestSchema, type AssistantRequest } from "./assistant";
import { answerFromBills } from "./assistant-model.server";
import { ServiceError, serviceResult } from "./service-error.server";

export async function askAssistant(input: AssistantRequest) {
  const userId = await getAuthenticatedUserId();
  return serviceResult(async () => {
    const data = assistantRequestSchema.parse(input);
    const db = getDatabase();
    const bills = await db
      .select()
      .from(items)
      .where(
        and(
          eq(items.userId, userId),
          data.itemId ? eq(items.id, data.itemId) : undefined,
        ),
      )
      .orderBy(desc(items.createdAt))
      .limit(51);
    if (data.itemId && !bills.length) throw new ServiceError("Bill not found.");
    if (!bills.length) return answerFromBills([], data.messages);
    if (!process.env["NVIDIA_LLM_API_KEY"])
      throw new ServiceError(
        "The assistant is not configured on this server. Please try again after setup.",
      );
    // A database counter, not process memory, keeps limits effective across serverless instances.
    const expired = sql`${appUsers.assistantWindowStartedAt} <= now() - interval '1 day'`;
    const [usage] = await db
      .update(appUsers)
      .set({
        assistantCount: sql`CASE WHEN ${expired} THEN 1 ELSE ${appUsers.assistantCount} + 1 END`,
        assistantWindowStartedAt: sql`CASE WHEN ${expired} THEN now() ELSE ${appUsers.assistantWindowStartedAt} END`,
        assistantLastRequestedAt: new Date(),
      })
      .where(
        and(
          eq(appUsers.id, userId),
          sql`(${expired} OR ${appUsers.assistantCount} < 40)`,
          sql`(${appUsers.assistantLastRequestedAt} IS NULL OR ${appUsers.assistantLastRequestedAt} < now() - interval '3 seconds')`,
        ),
      )
      .returning({ id: appUsers.id });
    if (!usage)
      throw new ServiceError(
        "Please wait a few seconds before asking again. Each account can make up to 40 assistant requests per day.",
      );
    return answerFromBills(
      bills.slice(0, 50),
      data.messages,
      bills.length > 50,
    );
  });
}
