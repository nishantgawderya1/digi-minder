import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/db/index.server";
import {
  appUsers,
  documents,
  documentPages,
  items,
  reminders,
  documentJobs,
} from "@/db/schema";
import { getAuthenticatedUserId } from "./auth.server";
import { billFieldsSchema, saveBillSchema } from "./bills";
import { scheduleInTimezone } from "./notifications";
import { extractBillFields } from "./ocr";
import { runOcr } from "./ocr.server";
import {
  extractBillWithAi,
  EXTRACTION_VERSION,
} from "./bill-extraction.server";
import {
  deleteStoredFile,
  finalizeUpload,
  matchesFileSignature,
  signedDownload,
  signedUpload,
  storageConfigured,
  uploadKey,
} from "./storage.server";
import { serviceResult, ServiceError } from "./service-error.server";
import { autosaveSchema, draftPatchSchema, evidenceWithPages } from "./review";
import { backgroundConfigured } from "./inngest.server";
import { nvidiaLlmConfig } from "./nvidia-config.server";

async function ownedDocument(userId: string, id: string) {
  const [document] = await getDatabase()
    .select()
    .from(documents)
    .where(and(eq(documents.userId, userId), eq(documents.id, id)))
    .limit(1);
  if (!document) throw new ServiceError("Document not found.");
  return document;
}
const documentSummary = {
  id: documents.id,
  filename: documents.originalFilename,
  contentType: documents.contentType,
  status: documents.ocrStatus,
  createdAt: documents.createdAt,
};

export async function loadVault() {
  const userId = await getAuthenticatedUserId();
  return serviceResult(async () => {
    const db = getDatabase();
    const [bills, drafts, dueReminders] = await Promise.all([
      db
        .select()
        .from(items)
        .where(eq(items.userId, userId))
        .orderBy(desc(items.createdAt)),
      db
        .select(documentSummary)
        .from(documents)
        .where(and(eq(documents.userId, userId), isNull(documents.itemId)))
        .orderBy(desc(documents.createdAt))
        .limit(30),
      db
        .selectDistinctOn([reminders.itemId, reminders.deadlineType], {
          itemId: reminders.itemId,
          id: reminders.id,
          deadlineType: reminders.deadlineType,
          name: items.name,
        })
        .from(reminders)
        .innerJoin(
          items,
          and(
            eq(items.id, reminders.itemId),
            eq(items.userId, reminders.userId),
          ),
        )
        .where(
          and(
            eq(reminders.userId, userId),
            eq(reminders.channel, "in_app"),
            eq(reminders.status, "scheduled"),
            sql`coalesce(${reminders.snoozedUntil}, ${reminders.remindAt}) <= now()`,
            sql`CASE WHEN ${reminders.deadlineType} = 'warranty' THEN ${items.warrantyExpiresAt} ELSE ${items.returnExpiresAt} END >= (now() AT TIME ZONE (SELECT timezone FROM app_users WHERE id = ${userId}))::date`,
          ),
        )
        .orderBy(
          reminders.itemId,
          reminders.deadlineType,
          desc(reminders.remindAt),
        ),
    ]);
    return { bills, drafts, dueReminders };
  });
}
export async function loadBill(id: string) {
  const userId = await getAuthenticatedUserId();
  return serviceResult(async () => {
    const db = getDatabase();
    const [bill] = await db
      .select()
      .from(items)
      .where(and(eq(items.userId, userId), eq(items.id, id)))
      .limit(1);
    if (!bill) throw new ServiceError("Bill not found.");
    const files = await db
      .select(documentSummary)
      .from(documents)
      .where(and(eq(documents.userId, userId), eq(documents.itemId, id)));
    return { bill, documents: files };
  });
}
export async function loadReview(id: string) {
  const userId = await getAuthenticatedUserId();
  return serviceResult(async () => {
    const document = await ownedDocument(userId, id);
    const pages = await getDatabase()
      .select({
        pageIndex: documentPages.pageIndex,
        text: documentPages.text,
        confidence: documentPages.confidence,
        status: documentPages.status,
      })
      .from(documentPages)
      .where(
        and(eq(documentPages.userId, userId), eq(documentPages.documentId, id)),
      )
      .orderBy(asc(documentPages.pageIndex));
    const fields = billFieldsSchema.safeParse(
      document.extractedData?.["fields"],
    );
    const draft = draftPatchSchema.safeParse(document.draftFields);
    const [job] = await getDatabase()
      .select()
      .from(documentJobs)
      .where(
        and(eq(documentJobs.userId, userId), eq(documentJobs.documentId, id)),
      );
    return {
      id,
      itemId: document.itemId,
      filename: document.originalFilename,
      contentType: document.contentType,
      status: document.ocrStatus,
      error:
        document.ocrError ||
        (!pages.length &&
        document.ocrStatus !== "pending" &&
        !process.env["NVIDIA_NEMOTRON_OCR_API_KEY"]
          ? "NVIDIA OCR is not configured on this server. Retry reading to use local OCR, or enter the details manually."
          : null),
      extractionMethod:
        (
          document.extractedData?.["extraction"] as
            { method?: string } | undefined
        )?.method ?? null,
      pageCount: document.pageCount,
      pages,
      job: job
        ? {
            status: job.status,
            completedPages: job.completedPages,
            error: job.error,
          }
        : null,
      backgroundAvailable: backgroundConfigured(),
      revision: document.draftRevision,
      draftPatch: draft.success ? draft.data : {},
      evidence: evidenceWithPages(document.extractedData?.["evidence"], pages),
      fields: fields.success
        ? billFieldsSchema.parse({
            ...fields.data,
            ...(draft.success ? draft.data : {}),
          })
        : billFieldsSchema.parse({
            ...extractBillFields(
              pages
                .filter((page) => page.status === "complete")
                .map((page) => page.text ?? "")
                .join("\n\n"),
            ),
            ...(draft.success ? draft.data : {}),
          }),
      previewUrl:
        document.storageKey && document.ocrStatus !== "pending"
          ? await signedDownload(document.storageKey, document.originalFilename)
          : null,
    };
  });
}

export async function beginUpload(data: {
  filename: string;
  contentType: string;
  byteSize: number;
  pageCount: number;
}) {
  const userId = await getAuthenticatedUserId();
  return serviceResult(async () => {
    if (!storageConfigured())
      throw new ServiceError(
        "Document storage is unavailable. Please try again later.",
      );
    const db = getDatabase();
    // An atomic account counter prevents parallel requests or draft deletion bypassing the quota.
    const expiredWindow = sql`${appUsers.uploadWindowStartedAt} <= now() - interval '1 day'`;
    const [usage] = await db
      .update(appUsers)
      .set({
        uploadCount: sql`CASE WHEN ${expiredWindow} THEN 1 ELSE ${appUsers.uploadCount} + 1 END`,
        uploadWindowStartedAt: sql`CASE WHEN ${expiredWindow} THEN now() ELSE ${appUsers.uploadWindowStartedAt} END`,
      })
      .where(
        and(
          eq(appUsers.id, userId),
          or(expiredWindow, sql`${appUsers.uploadCount} < 30`),
        ),
      )
      .returning({ id: appUsers.id });
    if (!usage)
      throw new ServiceError(
        "Daily upload limit reached. Please try again tomorrow.",
      );
    const id = randomUUID();
    const key = uploadKey(userId, id);
    const url = await signedUpload(key, data.contentType, data.byteSize);
    await db.insert(documents).values({
      id,
      userId,
      originalFilename: data.filename,
      contentType: data.contentType,
      byteSize: String(data.byteSize),
      pageCount: data.pageCount,
      storageProvider: "s3",
      storageKey: key,
      documentType: "bill",
    });
    return {
      id,
      uploadUrl: url,
      ocrAvailable: Boolean(process.env["NVIDIA_NEMOTRON_OCR_API_KEY"]),
    };
  });
}
export async function completeUpload(id: string) {
  const userId = await getAuthenticatedUserId();
  return serviceResult(async () => {
    const document = await ownedDocument(userId, id);
    if (document.ocrStatus !== "pending") {
      if (!document.itemId)
        await (await import("./processing.server")).ensureQueued(id, userId);
      return { id, backgroundAvailable: backgroundConfigured() };
    }
    if (!document.storageKey) throw new ServiceError("Upload not found.");
    const finalKey = `users/${encodeURIComponent(userId)}/documents/${id}`;
    await finalizeUpload(
      document.storageKey,
      finalKey,
      document.contentType,
      Number(document.byteSize),
    );
    await getDatabase().batch([
      getDatabase()
        .update(documents)
        .set({
          storageKey: finalKey,
          ocrStatus: "processing",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(documents.userId, userId),
            eq(documents.id, id),
            eq(documents.ocrStatus, "pending"),
          ),
        ),
      getDatabase()
        .insert(documentJobs)
        .values({ documentId: id, userId })
        .onConflictDoNothing(),
    ]);
    // Retryable cleanup: removing a missing S3 key is idempotent.
    await deleteStoredFile(document.storageKey).catch(() =>
      console.warn("Pending document cleanup deferred."),
    );
    await (
      await import("./processing.server")
    ).ensureQueued(document.id, userId);
    return { id, backgroundAvailable: backgroundConfigured() };
  });
}
export async function readDocumentPage(data: {
  id: string;
  pageIndex: number;
  imageDataUrl: string;
}) {
  const userId = await getAuthenticatedUserId();
  return readDocumentPageForOwner(userId, data);
}
export async function readDocumentPageForOwner(
  userId: string,
  data: { id: string; pageIndex: number; imageDataUrl: string },
) {
  return serviceResult(async () => {
    const db = getDatabase();
    const document = await ownedDocument(userId, data.id);
    if (
      document.itemId ||
      document.ocrStatus === "pending" ||
      data.pageIndex >= document.pageCount
    )
      throw new ServiceError("This document isn't available for reading.");
    if (!process.env["NVIDIA_NEMOTRON_OCR_API_KEY"])
      throw new ServiceError(
        "NVIDIA OCR is not configured on this server. Retry reading to use local OCR, or enter the details manually.",
      );
    const bytes = Buffer.from(data.imageDataUrl.split(",")[1]!, "base64");
    if (
      !matchesFileSignature(
        bytes,
        data.imageDataUrl.startsWith("data:image/png")
          ? "image/png"
          : "image/jpeg",
      )
    )
      throw new ServiceError("The page image is invalid.");
    const scope = and(
      eq(documentPages.userId, userId),
      eq(documentPages.documentId, data.id),
      eq(documentPages.pageIndex, data.pageIndex),
    );
    const [previous] = await db.select().from(documentPages).where(scope);
    if (previous?.status === "complete") return { pageIndex: data.pageIndex };
    const [claimed] = await db
      .insert(documentPages)
      .values({ userId, documentId: data.id, pageIndex: data.pageIndex })
      .onConflictDoUpdate({
        target: [documentPages.documentId, documentPages.pageIndex],
        set: {
          status: "processing",
          attempts: sql`${documentPages.attempts} + 1`,
          updatedAt: new Date(),
        },
        setWhere: and(
          eq(documentPages.userId, userId),
          sql`${documentPages.attempts} < 3`,
          or(
            eq(documentPages.status, "failed"),
            sql`${documentPages.updatedAt} < now() - interval '2 minutes'`,
          ),
        )!,
      })
      .returning();
    if (!claimed)
      throw new ServiceError(
        "This page is already being read or has reached its retry limit. You can enter its details manually.",
      );
    try {
      const result = await runOcr(data.imageDataUrl);
      await db
        .update(documentPages)
        .set({
          status: "complete",
          text: result.text,
          confidence: result.confidence?.toFixed(4) ?? null,
          updatedAt: new Date(),
        })
        .where(scope);
      return { pageIndex: data.pageIndex };
    } catch (error) {
      await db.batch([
        db
          .update(documentPages)
          .set({ status: "failed", updatedAt: new Date() })
          .where(scope),
        db
          .update(documents)
          .set({
            ocrStatus: "failed",
            ocrError:
              error instanceof ServiceError
                ? error.message
                : "One or more pages could not be read. Retry or complete the bill manually.",
            updatedAt: new Date(),
          })
          .where(and(eq(documents.userId, userId), eq(documents.id, data.id))),
      ]);
      throw error;
    }
  });
}
export async function acceptLocalPage(data: {
  id: string;
  pageIndex: number;
  text: string;
  confidence: number | null;
  source: "tesseract" | "pdf-text";
}) {
  const userId = await getAuthenticatedUserId();
  return acceptLocalPageForOwner(userId, data);
}
export async function acceptLocalPageForOwner(
  userId: string,
  data: {
    id: string;
    pageIndex: number;
    text: string;
    confidence: number | null;
    source: "tesseract" | "pdf-text";
  },
) {
  return serviceResult(async () => {
    const db = getDatabase();
    const document = await ownedDocument(userId, data.id);
    if (
      document.itemId ||
      document.ocrStatus === "pending" ||
      data.pageIndex >= document.pageCount
    )
      throw new ServiceError("This document isn't available for reading.");
    const scope = and(
      eq(documentPages.userId, userId),
      eq(documentPages.documentId, data.id),
      eq(documentPages.pageIndex, data.pageIndex),
    );
    const [previous] = await db.select().from(documentPages).where(scope);
    if (previous?.status === "complete") return { pageIndex: data.pageIndex };
    const [saved] = await db
      .insert(documentPages)
      .values({
        userId,
        documentId: data.id,
        pageIndex: data.pageIndex,
        status: "complete",
        text: data.text,
        confidence: data.confidence?.toFixed(4) ?? null,
      })
      .onConflictDoUpdate({
        target: [documentPages.documentId, documentPages.pageIndex],
        set: {
          status: "complete",
          text: data.text,
          confidence: data.confidence?.toFixed(4) ?? null,
          updatedAt: new Date(),
        },
        setWhere: and(
          eq(documentPages.userId, userId),
          or(
            eq(documentPages.status, "failed"),
            and(
              eq(documentPages.status, "processing"),
              sql`${documentPages.updatedAt} < now() - interval '2 minutes'`,
            ),
          ),
        )!,
      })
      .returning({ id: documentPages.id });
    if (!saved)
      throw new ServiceError(
        "This page is already being read. Please retry shortly.",
      );
    await db
      .update(documents)
      .set({
        extractedData: sql`coalesce(${documents.extractedData}, '{}'::jsonb) || jsonb_build_object(${data.source === "pdf-text" ? "embeddedTextUsed" : "localOcrUsed"}::text, true)`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(documents.userId, userId),
          eq(documents.id, data.id),
          isNull(documents.itemId),
        ),
      );
    return { pageIndex: data.pageIndex };
  });
}

export async function finishReading(id: string) {
  const userId = await getAuthenticatedUserId();
  return finishReadingForOwner(userId, id);
}
export async function finishReadingForOwner(userId: string, id: string) {
  return serviceResult(async () => {
    const document = await ownedDocument(userId, id);
    if (document.itemId || document.ocrStatus === "pending")
      throw new ServiceError("This document isn't available for reading.");
    const pages = await getDatabase()
      .select()
      .from(documentPages)
      .where(
        and(eq(documentPages.userId, userId), eq(documentPages.documentId, id)),
      )
      .orderBy(asc(documentPages.pageIndex));
    if (
      pages.length !== document.pageCount ||
      pages.some((page) => page.status !== "complete")
    )
      throw new ServiceError(
        "Some pages still need to be read. You can retry or complete the bill manually.",
      );
    const rawText = pages
      .map((page) => `[Page ${page.pageIndex + 1}]\n${page.text ?? ""}`)
      .join("\n\n");
    const prior = z
      .object({
        version: z.number(),
        method: z.string().optional(),
        attempts: z.number().int(),
      })
      .safeParse(document.extractedData?.["extraction"]);
    if (
      prior.success &&
      prior.data.version === EXTRACTION_VERSION &&
      prior.data.method === "nvidia-llm"
    )
      return { id };
    if (prior.success && prior.data.attempts >= 3)
      throw new ServiceError(
        "AI extraction has reached its retry limit. Your extracted text and fields are still available for review.",
      );
    const requestId = randomUUID();
    const scope = and(
      eq(documents.userId, userId),
      eq(documents.id, id),
      isNull(documents.itemId),
    );
    // Claim in Postgres, so concurrent retries cannot multiply paid model calls.
    const [claimed] = await getDatabase()
      .update(documents)
      .set({
        extractedData: sql`coalesce(${documents.extractedData}, '{}'::jsonb) || jsonb_build_object('extraction', jsonb_build_object(
        'version', ${EXTRACTION_VERSION}::int, 'status', 'processing', 'requestId', ${requestId}::text,
        'attempts', coalesce((${documents.extractedData}->'extraction'->>'attempts')::int, 0) + ${nvidiaLlmConfig().key ? 1 : 0}::int))`,
        updatedAt: new Date(),
      })
      .where(
        and(
          scope,
          sql`coalesce((${documents.extractedData}->'extraction'->>'attempts')::int, 0) < 3`,
          sql`(coalesce(${documents.extractedData}->'extraction'->>'status', '') <> 'processing' OR ${documents.updatedAt} < now() - interval '2 minutes')`,
          sql`coalesce(${documents.extractedData}->'extraction'->>'method', '') <> 'nvidia-llm'`,
        ),
      )
      .returning({ extractedData: documents.extractedData });
    if (!claimed)
      throw new ServiceError(
        "Bill details are already being extracted or have reached their retry limit. Please refresh the review.",
      );
    const result = await extractBillWithAi(rawText);
    await getDatabase()
      .update(documents)
      .set({
        ocrStatus: "review",
        ocrError: result.warning,
        extractedData: sql`coalesce(${documents.extractedData}, '{}'::jsonb) || ${JSON.stringify(
          {
            ...claimed.extractedData,
            fields: result.fields,
            evidence: result.evidence,
            extraction: {
              ...(claimed.extractedData?.["extraction"] as Record<
                string,
                unknown
              >),
              status: "complete",
              method: result.method,
              model: result.model,
            },
          },
        )}::jsonb`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(documents.userId, userId),
          eq(documents.id, id),
          isNull(documents.itemId),
          sql`${documents.extractedData}->'extraction'->>'requestId' = ${requestId}`,
        ),
      );
    return { id };
  });
}
export async function autosaveReview(input: z.infer<typeof autosaveSchema>) {
  const userId = await getAuthenticatedUserId();
  return serviceResult(async () => {
    const data = autosaveSchema.parse(input);
    const [saved] = await getDatabase()
      .update(documents)
      .set({
        draftFields: sql`coalesce(${documents.draftFields}, '{}'::jsonb) || ${JSON.stringify(data.patch)}::jsonb`,
        draftRevision: sql`${documents.draftRevision} + 1`,
      })
      .where(
        and(
          eq(documents.userId, userId),
          eq(documents.id, data.id),
          isNull(documents.itemId),
          eq(documents.draftRevision, data.revision),
          sql`${documents.ocrStatus} <> 'pending'`,
        ),
      )
      .returning({ revision: documents.draftRevision });
    if (!saved) {
      const document = await ownedDocument(userId, data.id);
      if (
        !document.itemId &&
        document.draftRevision === data.revision + 1 &&
        Object.entries(data.patch).every(
          ([field, value]) =>
            JSON.stringify(document.draftFields?.[field]) ===
            JSON.stringify(value),
        )
      )
        return { revision: document.draftRevision };
      throw new ServiceError(
        "These details changed in another window. Refresh before editing again.",
      );
    }
    return saved;
  });
}
export async function saveBill(data: z.infer<typeof saveBillSchema>) {
  const userId = await getAuthenticatedUserId();
  return serviceResult(async () => {
    const db = getDatabase();
    if (data.documentId) {
      const document = await ownedDocument(userId, data.documentId);
      if (
        document.ocrStatus === "pending" ||
        data.id !== data.documentId ||
        (document.itemId && document.itemId !== data.id)
      )
        throw new ServiceError(
          "Finish uploading the original before saving this bill.",
        );
    }
    const [existing] = await db
      .select({
        id: items.id,
        warrantyExpiresAt: items.warrantyExpiresAt,
        returnExpiresAt: items.returnExpiresAt,
        reminderDays: items.reminderDays,
      })
      .from(items)
      .where(and(eq(items.id, data.id), eq(items.userId, userId)));
    if (!data.documentId && !existing)
      throw new ServiceError("Upload a bill before saving its details.");
    const values = {
      ...data.fields,
      userId,
      reminderDays: [...new Set(data.fields.reminderDays)],
      updatedAt: new Date(),
    };
    const [preferences] = await db
      .select()
      .from(appUsers)
      .where(eq(appUsers.id, userId));
    const schedule = scheduleInTimezone(data.fields, preferences!);
    const rebuildSchedule =
      !existing ||
      existing.warrantyExpiresAt !== data.fields.warrantyExpiresAt ||
      existing.returnExpiresAt !== data.fields.returnExpiresAt ||
      JSON.stringify(
        [...new Set(existing.reminderDays)].sort((a, b) => a - b),
      ) !== JSON.stringify([...values.reminderDays].sort((a, b) => a - b));
    const [saved] = await db.batch([
      db
        .insert(items)
        .values({ ...values, id: data.id })
        .onConflictDoUpdate({
          target: items.id,
          set: values,
          setWhere: eq(items.userId, userId),
        })
        .returning({ id: items.id }),
      db
        .update(documents)
        .set({
          itemId: data.id,
          ocrStatus: "complete",
          draftFields: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(documents.userId, userId),
            eq(documents.id, data.documentId ?? data.id),
          ),
        ),
      db
        .update(reminders)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(reminders.userId, userId),
            eq(reminders.itemId, data.id),
            eq(reminders.status, "scheduled"),
            sql`${rebuildSchedule}`,
          ),
        ),
      ...(schedule.length && rebuildSchedule
        ? [
            db
              .insert(reminders)
              .values(
                schedule.map((reminder) => ({
                  ...reminder,
                  userId,
                  itemId: data.id,
                })),
              )
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
        : []),
    ]);
    if (!saved[0]) throw new ServiceError("Bill not found.");
    return saved[0];
  });
}
export async function getDocumentLink(id: string, download: boolean) {
  const userId = await getAuthenticatedUserId();
  return serviceResult(async () => {
    const document = await ownedDocument(userId, id);
    if (!document.storageKey || document.ocrStatus === "pending")
      throw new ServiceError("The original file hasn't finished uploading.");
    return {
      url: await signedDownload(
        document.storageKey,
        document.originalFilename,
        download,
      ),
    };
  });
}
export async function removeBill(id: string) {
  const userId = await getAuthenticatedUserId();
  return serviceResult(async () => {
    const db = getDatabase();
    const files = await db
      .select({ key: documents.storageKey })
      .from(documents)
      .where(and(eq(documents.userId, userId), eq(documents.itemId, id)));
    for (const file of files) if (file.key) await deleteStoredFile(file.key);
    await db
      .delete(items)
      .where(and(eq(items.userId, userId), eq(items.id, id)));
    return { id };
  });
}
export async function removeDraft(id: string) {
  const userId = await getAuthenticatedUserId();
  return serviceResult(async () => {
    const document = await ownedDocument(userId, id);
    if (document.itemId)
      throw new ServiceError("This bill has already been saved.");
    if (document.storageKey) await deleteStoredFile(document.storageKey);
    await getDatabase()
      .delete(documents)
      .where(
        and(
          eq(documents.userId, userId),
          eq(documents.id, id),
          isNull(documents.itemId),
        ),
      );
    return { id };
  });
}
