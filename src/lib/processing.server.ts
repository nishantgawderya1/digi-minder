import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getDatabase } from "@/db/index.server";
import { documentJobs, documents } from "@/db/schema";
import { getAuthenticatedUserId } from "./auth.server";
import { backgroundConfigured, inngest } from "./inngest.server";
import { serviceResult, ServiceError } from "./service-error.server";

export async function dispatchJob(documentId: string, generation: number) {
  if (!backgroundConfigured()) return false;
  await inngest.send({
    id: `document-${documentId}-${generation}`,
    name: "warrantly/document.queued",
    data: { documentId, generation },
  });
  await getDatabase()
    .update(documentJobs)
    .set({ dispatchedAt: new Date() })
    .where(
      and(
        eq(documentJobs.documentId, documentId),
        eq(documentJobs.generation, generation),
      ),
    );
  return true;
}

export async function ensureQueued(documentId: string, userId: string) {
  await getDatabase()
    .insert(documentJobs)
    .values({ documentId, userId })
    .onConflictDoNothing();
  const [job] = await getDatabase()
    .select()
    .from(documentJobs)
    .where(
      and(
        eq(documentJobs.documentId, documentId),
        eq(documentJobs.userId, userId),
      ),
    );
  if (job?.status === "queued" && !job.dispatchedAt)
    await dispatchJob(documentId, job.generation).catch(() =>
      console.warn("Document queued; dispatch will be retried."),
    );
}

export async function queueReading(id: string) {
  const userId = await getAuthenticatedUserId();
  return serviceResult(async () => {
    const [document] = await getDatabase()
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.id, id),
          eq(documents.userId, userId),
          isNull(documents.itemId),
        ),
      );
    if (!document || document.ocrStatus === "pending")
      throw new ServiceError(
        "Finish uploading the original before reading it.",
      );
    await ensureQueued(id, userId);
    const [job] = await getDatabase()
      .update(documentJobs)
      .set({
        generation: sql`${documentJobs.generation} + 1`,
        status: "queued",
        error: null,
        dispatchedAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(documentJobs.documentId, id),
          eq(documentJobs.userId, userId),
          sql`${documentJobs.status} IN ('failed', 'complete')`,
        ),
      )
      .returning();
    if (job) {
      await getDatabase()
        .update(documents)
        .set({ ocrStatus: "processing", ocrError: null })
        .where(
          and(
            eq(documents.id, id),
            eq(documents.userId, userId),
            isNull(documents.itemId),
          ),
        );
      await dispatchJob(id, job.generation).catch(() =>
        console.warn("Document queued; dispatch will be retried."),
      );
    }
    return { id };
  });
}

export async function dispatchPendingJobs() {
  const exhausted = await getDatabase()
    .select({
      documentId: documentJobs.documentId,
      generation: documentJobs.generation,
    })
    .from(documentJobs)
    .where(
      sql`${documentJobs.status} IN ('queued','reading','extracting') AND ${documentJobs.dispatchedAt} IS NOT NULL AND ${documentJobs.updatedAt} < now() - interval '15 minutes' AND ${documentJobs.generation} >= 3`,
    )
    .limit(50);
  for (const job of exhausted) await failJob(job.documentId, job.generation);
  await getDatabase()
    .update(documentJobs)
    .set({
      generation: sql`${documentJobs.generation}+1`,
      status: "queued",
      dispatchedAt: null,
      error: null,
      updatedAt: new Date(),
    })
    .where(
      sql`${documentJobs.status} IN ('queued','reading','extracting') AND ${documentJobs.dispatchedAt} IS NOT NULL AND ${documentJobs.updatedAt} < now() - interval '15 minutes' AND ${documentJobs.generation} < 3`,
    );
  const jobs = await getDatabase()
    .select()
    .from(documentJobs)
    .where(
      and(
        eq(documentJobs.status, "queued"),
        sql`${documentJobs.dispatchedAt} IS NULL OR ${documentJobs.dispatchedAt} < now() - interval '10 minutes'`,
      ),
    )
    .orderBy(asc(documentJobs.updatedAt))
    .limit(50);
  for (const job of jobs) await dispatchJob(job.documentId, job.generation);
  return jobs.length;
}

export async function processingDocument(
  documentId: string,
  generation: number,
) {
  const [job] = await getDatabase()
    .select()
    .from(documentJobs)
    .where(
      and(
        eq(documentJobs.documentId, documentId),
        eq(documentJobs.generation, generation),
      ),
    );
  if (!job || job.status === "complete" || job.status === "failed") return null;
  const [document] = await getDatabase()
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.id, documentId),
        eq(documents.userId, job.userId),
        isNull(documents.itemId),
      ),
    );
  return document?.storageKey && document.ocrStatus !== "pending"
    ? document
    : null;
}

export async function jobProgress(
  documentId: string,
  generation: number,
  status: string,
  completedPages: number,
) {
  await getDatabase()
    .update(documentJobs)
    .set({ status, completedPages, updatedAt: new Date() })
    .where(
      and(
        eq(documentJobs.documentId, documentId),
        eq(documentJobs.generation, generation),
        sql`${documentJobs.status} <> 'failed'`,
      ),
    );
}

export async function failJob(documentId: string, generation: number) {
  const message =
    "Automatic reading couldn't finish after retries. Your original and saved corrections are safe. Retry reading or complete the details manually.";
  const [job] = await getDatabase()
    .update(documentJobs)
    .set({ status: "failed", error: message, updatedAt: new Date() })
    .where(
      and(
        eq(documentJobs.documentId, documentId),
        eq(documentJobs.generation, generation),
        sql`${documentJobs.status} <> 'complete'`,
      ),
    )
    .returning();
  if (job)
    await getDatabase()
      .update(documents)
      .set({ ocrStatus: "failed", ocrError: message })
      .where(
        and(
          eq(documents.id, documentId),
          eq(documents.userId, job.userId),
          isNull(documents.itemId),
        ),
      );
}
