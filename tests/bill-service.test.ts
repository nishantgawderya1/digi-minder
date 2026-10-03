import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import * as schema from "@/db/schema";
import { emptyBillFields } from "@/lib/bills";
import { extractBillFields } from "@/lib/ocr";
import type { ExtractionOptions } from "@/lib/bill-extraction.server";
import { ServiceError } from "@/lib/service-error.server";

const dependencies = vi.hoisted(() => ({
  getDatabase: vi.fn(),
  getAuthenticatedUserId: vi.fn(),
  runOcr: vi.fn(),
  extractBillWithAi: vi.fn(),
  signedDownload: vi.fn(),
  deleteStoredFile: vi.fn(),
  signedUpload: vi.fn(),
  finalizeUpload: vi.fn(),
  answerFromBills: vi.fn(),
  sendEvent: vi.fn(),
  backgroundConfigured: vi.fn(),
  readStoredOriginal: vi.fn(),
  prepareServerPage: vi.fn(),
  clerkGetUser: vi.fn(),
  sendEmail: vi.fn(),
}));
vi.mock("@/db/index.server", () => ({ getDatabase: dependencies.getDatabase }));
vi.mock("@/lib/auth.server", () => ({
  getAuthenticatedUserId: dependencies.getAuthenticatedUserId,
}));
vi.mock("@clerk/tanstack-react-start/server", () => ({
  clerkClient: () => ({ users: { getUser: dependencies.clerkGetUser } }),
}));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: dependencies.sendEmail };
  },
}));
vi.mock("@/lib/inngest.server", () => ({
  backgroundConfigured: dependencies.backgroundConfigured,
  inngest: { send: dependencies.sendEvent },
}));
vi.mock("@/lib/document-render.server", () => ({
  prepareServerPage: dependencies.prepareServerPage,
}));
vi.mock("@/lib/ocr.server", () => ({ runOcr: dependencies.runOcr }));
vi.mock("@/lib/assistant-model.server", () => ({
  answerFromBills: dependencies.answerFromBills,
}));
vi.mock("@/lib/bill-extraction.server", () => ({
  extractBillWithAi: dependencies.extractBillWithAi,
  EXTRACTION_VERSION: 2,
}));
vi.mock("@/lib/storage.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage.server")>()),
  signedDownload: dependencies.signedDownload,
  deleteStoredFile: dependencies.deleteStoredFile,
  signedUpload: dependencies.signedUpload,
  finalizeUpload: dependencies.finalizeUpload,
  storageConfigured: () => true,
  readStoredOriginal: dependencies.readStoredOriginal,
}));
import * as service from "@/lib/bill-service.server";
import { askAssistant } from "@/lib/assistant-service.server";
import {
  queueReading,
  failJob,
  dispatchPendingJobs,
} from "@/lib/processing.server";
import {
  processPage,
  extractProcessedDocument,
} from "@/lib/document-worker.server";
import {
  loadNotifications,
  saveNotificationPreferences,
  actOnReminder,
} from "@/lib/notification-service.server";
import { dueEmailIds, deliverReminder } from "@/lib/reminder-delivery.server";

// Exercise the real Neon Drizzle query builder and batch mapping against isolated Postgres.
const pg = new PGlite();
type Query = {
  sql: string;
  params: unknown[];
  options: { arrayMode?: boolean };
};
async function execute(database: PGlite | Transaction, query: Query) {
  return database.query(query.sql, query.params, {
    rowMode: query.options.arrayMode ? "array" : "object",
    parsers: {
      1082: (value) => value,
      1184: (value) => value,
      1114: (value) => value,
      1700: (value) => value,
    },
  });
}
const client = Object.assign(() => {}, {
  query: (sql: string, params: unknown[], options: Query["options"]) => {
    const query = { sql, params, options };
    return {
      ...query,
      then: (
        resolve: (value: unknown) => unknown,
        reject: (error: unknown) => unknown,
      ) => execute(pg, query).then(resolve, reject),
    };
  },
  transaction: (queries: Query[]) =>
    pg.transaction(async (tx) => {
      const results = [];
      for (const query of queries) results.push(await execute(tx, query));
      return results;
    }),
});
const db = drizzle({
  client: client as unknown as NeonQueryFunction<false, false>,
  schema,
});
const userA = "test-user-a";
const userB = "test-user-b";
let id: string;
beforeAll(async () => {
  for (const migration of readMigrationFiles({
    migrationsFolder: "./src/db/migrations/generated",
  }))
    await pg.exec(migration.sql.join(";\n"));
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await pg.close();
});
beforeEach(async () => {
  vi.clearAllMocks();
  await pg.exec("TRUNCATE app_users CASCADE");
  dependencies.getDatabase.mockReturnValue(db);
  dependencies.getAuthenticatedUserId.mockResolvedValue(userA);
  dependencies.signedDownload.mockResolvedValue(
    "https://storage.invalid/signed-original",
  );
  dependencies.deleteStoredFile.mockResolvedValue(undefined);
  dependencies.runOcr.mockResolvedValue({
    text: "Product name: Reading lamp\nSerial number: 001100\nTotal: INR 120.00",
    confidence: 0.95,
  });
  dependencies.signedUpload.mockResolvedValue(
    "https://storage.invalid/signed-upload",
  );
  dependencies.finalizeUpload.mockResolvedValue(undefined);
  dependencies.sendEvent.mockResolvedValue({ ids: [] });
  dependencies.backgroundConfigured.mockReturnValue(true);
  dependencies.readStoredOriginal.mockResolvedValue(new Uint8Array([1]));
  dependencies.prepareServerPage.mockResolvedValue({
    text: "Product name: Background lamp\nInvoice number: 000045\nTotal: INR 170.00",
    imageDataUrl: null,
  });
  dependencies.clerkGetUser.mockResolvedValue({
    primaryEmailAddressId: "verified-primary",
    emailAddresses: [
      {
        id: "verified-primary",
        emailAddress: "owner@example.invalid",
        verification: { status: "verified" },
      },
    ],
  });
  dependencies.sendEmail.mockResolvedValue({
    data: { id: "provider-id" },
    error: null,
  });
  vi.stubEnv("RESEND_API_KEY", "test-key-not-real");
  vi.stubEnv("REMINDER_FROM_EMAIL", "Warrantly <reminders@example.invalid>");
  vi.stubEnv("APP_BASE_URL", "https://warrantly.example.invalid");
  dependencies.answerFromBills.mockResolvedValue({
    answer: "Grounded answer",
    sources: [],
  });
  vi.stubEnv("NVIDIA_NEMOTRON_OCR_API_KEY", "test-key-not-real");
  vi.stubEnv("NVIDIA_LLM_API_KEY", "test-key-not-real");
  dependencies.extractBillWithAi.mockImplementation(
    async (text: string, options: ExtractionOptions) => {
      await options.beforeRequest?.();
      return {
        fields: extractBillFields(text),
        evidence: {},
        method: "nvidia-llm",
        model: "test-model",
        warning: null,
      };
    },
  );
  await db.insert(schema.appUsers).values([{ id: userA }, { id: userB }]);
  id = randomUUID();
  await db.insert(schema.documents).values({
    id,
    userId: userA,
    originalFilename: "bill.png",
    contentType: "image/png",
    byteSize: "100",
    documentType: "bill",
    storageKey: `users/${userA}/documents/${id}`,
    ocrStatus: "processing",
  });
});

describe("Private document lifecycle", () => {
  it("stores embedded PDF text without inventing OCR confidence", async () => {
    expect(
      (
        await service.acceptLocalPage({
          id,
          pageIndex: 0,
          text: "Invoice: TEST-001",
          confidence: null,
          source: "pdf-text",
        })
      ).ok,
    ).toBe(true);
    const review = await service.loadReview(id);
    expect(review.ok && review.data.pages[0]?.confidence).toBeNull();
    const [document] = await db.select().from(schema.documents);
    expect(document?.extractedData?.["embeddedTextUsed"]).toBe(true);
  });
  it("enforces an atomic account quota even after drafts are deleted", async () => {
    await pg.query("UPDATE app_users SET upload_count=29 WHERE id=$1", [userA]);
    const request = {
      filename: "new.png",
      contentType: "image/png",
      byteSize: 100,
      pageCount: 1,
    };
    const upload = await service.beginUpload(request);
    if (!upload.ok) throw new Error(upload.error);
    await service.removeDraft(upload.data.id);
    expect((await service.beginUpload(request)).ok).toBe(false);
    await pg.query(
      "UPDATE app_users SET upload_window_started_at=now()-interval '2 days' WHERE id=$1",
      [userA],
    );
    expect((await service.beginUpload(request)).ok).toBe(true);
  });
  it("persists OCR, permits review edits, saves once, and reloads only actual records", async () => {
    expect(
      await service.readDocumentPage({
        id,
        pageIndex: 0,
        imageDataUrl: "data:image/png;base64,iVBORw0KGgo=",
      }),
    ).toEqual({ ok: true, data: { pageIndex: 0 } });
    expect((await service.finishReading(id)).ok).toBe(true);
    const review = await service.loadReview(id);
    expect(review.ok && review.data.fields).toMatchObject({
      name: "Reading lamp",
      serialNumber: "001100",
      purchasePrice: "120.00",
    });
    const fields = {
      ...emptyBillFields(),
      name: "Corrected bill",
      purchasePrice: "121.00",
      purchaseDate: "2026-10-01",
      warrantyExpiresAt: "2099-10-01",
    };
    expect((await service.saveBill({ id, documentId: id, fields })).ok).toBe(
      true,
    );
    expect((await service.saveBill({ id, documentId: id, fields })).ok).toBe(
      true,
    );
    const vault = await service.loadVault();
    expect(vault.ok && vault.data.bills).toHaveLength(1);
    expect(vault.ok && vault.data.drafts).toHaveLength(0);
    expect(vault.ok && vault.data.bills[0]?.purchasePrice).toBe("121.00");
    expect((await pg.query("SELECT * FROM reminders")).rows).toHaveLength(3);
    const bill = await service.loadBill(id);
    expect(bill.ok && bill.data.documents).toHaveLength(1);
  });
  it("never reads, changes, signs, processes or deletes another account's document", async () => {
    const fields = { ...emptyBillFields(), name: "Owner's bill" };
    await service.saveBill({ id, documentId: id, fields });
    dependencies.getAuthenticatedUserId.mockResolvedValue(userB);
    const vault = await service.loadVault();
    expect(vault.ok && vault.data.bills).toEqual([]);
    expect((await service.loadBill(id)).ok).toBe(false);
    expect((await service.loadReview(id)).ok).toBe(false);
    expect((await service.getDocumentLink(id, true)).ok).toBe(false);
    expect((await service.completeUpload(id)).ok).toBe(false);
    expect(
      (
        await service.readDocumentPage({
          id,
          pageIndex: 0,
          imageDataUrl: "data:image/png;base64,iVBORw0KGgo=",
        })
      ).ok,
    ).toBe(false);
    expect((await service.finishReading(id)).ok).toBe(false);
    expect((await service.saveBill({ id, documentId: id, fields })).ok).toBe(
      false,
    );
    expect((await service.saveBill({ id, documentId: null, fields })).ok).toBe(
      false,
    );
    expect((await service.removeDraft(id)).ok).toBe(false);
    await service.removeBill(id);
    expect(dependencies.signedDownload).not.toHaveBeenCalled();
    expect(dependencies.deleteStoredFile).not.toHaveBeenCalled();
    expect(dependencies.runOcr).not.toHaveBeenCalled();
    expect(dependencies.extractBillWithAi).not.toHaveBeenCalled();
    expect(
      (
        await service.acceptLocalPage({
          source: "tesseract",
          id,
          pageIndex: 0,
          text: "Foreign document",
          confidence: 1,
        })
      ).ok,
    ).toBe(false);
    expect((await pg.query("SELECT * FROM items")).rows).toHaveLength(1);
  });
  it("enforces composite account foreign keys in Postgres itself", async () => {
    await service.saveBill({
      id,
      documentId: id,
      fields: { ...emptyBillFields(), name: "Owned bill" },
    });
    await expect(
      db.insert(schema.documents).values({
        userId: userB,
        itemId: id,
        originalFilename: "x.pdf",
        contentType: "application/pdf",
        byteSize: "10",
        documentType: "bill",
      }),
    ).rejects.toThrow();
    await expect(
      db
        .insert(schema.documentPages)
        .values({ userId: userB, documentId: id, pageIndex: 0 }),
    ).rejects.toThrow();
  });
  it("requires authentication before storage, OCR, or database work", async () => {
    dependencies.getAuthenticatedUserId.mockRejectedValue(
      new Error("Unauthenticated"),
    );
    dependencies.getDatabase.mockClear();
    await expect(service.loadVault()).rejects.toThrow("Unauthenticated");
    await expect(service.getDocumentLink(id, false)).rejects.toThrow(
      "Unauthenticated",
    );
    await expect(
      service.beginUpload({
        filename: "x.png",
        contentType: "image/png",
        byteSize: 100,
        pageCount: 1,
      }),
    ).rejects.toThrow("Unauthenticated");
    expect(dependencies.getDatabase).not.toHaveBeenCalled();
    expect(dependencies.signedUpload).not.toHaveBeenCalled();
  });
  it("does not save or issue downloads before original upload completion", async () => {
    const upload = await service.beginUpload({
      filename: "new.png",
      contentType: "image/png",
      byteSize: 100,
      pageCount: 1,
    });
    if (!upload.ok) throw new Error(upload.error);
    expect(
      (
        await service.saveBill({
          id: upload.data.id,
          documentId: upload.data.id,
          fields: { ...emptyBillFields(), name: "Too early" },
        })
      ).ok,
    ).toBe(false);
    expect((await service.getDocumentLink(upload.data.id, false)).ok).toBe(
      false,
    );
    expect((await service.completeUpload(upload.data.id)).ok).toBe(true);
    expect((await service.completeUpload(upload.data.id)).ok).toBe(true);
    expect(dependencies.finalizeUpload).toHaveBeenCalledTimes(1);
  });
  it("resumes successful pages without duplicate OCR calls and limits failed retries", async () => {
    const request = {
      id,
      pageIndex: 0,
      imageDataUrl: "data:image/png;base64,iVBORw0KGgo=",
    };
    await service.readDocumentPage(request);
    await service.readDocumentPage(request);
    expect(dependencies.runOcr).toHaveBeenCalledTimes(1);
    await pg.exec("DELETE FROM document_pages");
    dependencies.runOcr.mockRejectedValue(
      new Error("Provider failure with confidential details"),
    );
    for (let i = 0; i < 4; i++)
      expect((await service.readDocumentPage(request)).ok).toBe(false);
    expect(dependencies.runOcr).toHaveBeenCalledTimes(4);
    expect((await service.loadReview(id)).ok).toBe(true);
  });
  it("keeps incomplete multi-page OCR as a draft with successful page data available", async () => {
    await pg.query("UPDATE documents SET page_count=2 WHERE id=$1", [id]);
    await service.readDocumentPage({
      id,
      pageIndex: 0,
      imageDataUrl: "data:image/png;base64,iVBORw0KGgo=",
    });
    expect((await service.finishReading(id)).ok).toBe(false);
    const review = await service.loadReview(id);
    expect(review.ok && review.data.fields.name).toBe("Reading lamp");
    expect((await pg.query("SELECT * FROM items")).rows).toHaveLength(0);
  });
  it("deletes originals and cascades only the owner's saved metadata", async () => {
    await service.readDocumentPage({
      id,
      pageIndex: 0,
      imageDataUrl: "data:image/png;base64,iVBORw0KGgo=",
    });
    await service.saveBill({
      id,
      documentId: id,
      fields: {
        ...emptyBillFields(),
        name: "Remove me",
        warrantyExpiresAt: "2099-10-01",
      },
    });
    expect((await service.removeBill(id)).ok).toBe(true);
    expect(dependencies.deleteStoredFile).toHaveBeenCalledWith(
      `users/${userA}/documents/${id}`,
    );
    for (const table of ["items", "documents", "document_pages", "reminders"])
      expect((await pg.query(`SELECT * FROM ${table}`)).rows).toHaveLength(0);
  });
  it("persists safe OCR errors and allows Tesseract to recover the same page", async () => {
    dependencies.runOcr.mockRejectedValue(
      new ServiceError("NVIDIA OCR access was rejected."),
    );
    await service.readDocumentPage({
      id,
      pageIndex: 0,
      imageDataUrl: "data:image/png;base64,iVBORw0KGgo=",
    });
    const failed = await service.loadReview(id);
    expect(failed.ok && failed.data.error).toBe(
      "NVIDIA OCR access was rejected.",
    );
    expect(
      (
        await service.acceptLocalPage({
          source: "tesseract",
          id,
          pageIndex: 0,
          text: "Product name: Local reading\nSerial number: 000123",
          confidence: 0.91,
        })
      ).ok,
    ).toBe(true);
    expect((await service.finishReading(id)).ok).toBe(true);
    const review = await service.loadReview(id);
    expect(review.ok && review.data.fields.serialNumber).toBe("000123");
    expect(review.ok && review.data.extractionMethod).toBe("nvidia-llm");
    await service.acceptLocalPage({
      source: "tesseract",
      id,
      pageIndex: 0,
      text: "Do not overwrite",
      confidence: 1,
    });
    const retained = await service.loadReview(id);
    expect(retained.ok && retained.data.pages[0]?.text).toContain(
      "Local reading",
    );
  });
  it("caches successful AI extraction and rejects concurrent duplicate calls", async () => {
    await service.readDocumentPage({
      id,
      pageIndex: 0,
      imageDataUrl: "data:image/png;base64,iVBORw0KGgo=",
    });
    let release!: (value: unknown) => void;
    dependencies.extractBillWithAi.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const first = service.finishReading(id);
    await vi.waitFor(() =>
      expect(dependencies.extractBillWithAi).toHaveBeenCalledTimes(1),
    );
    expect((await service.finishReading(id)).ok).toBe(false);
    release({
      fields: { ...emptyBillFields(), name: "AI bill" },
      evidence: {},
      method: "nvidia-llm",
      model: "test-model",
      warning: null,
    });
    expect((await first).ok).toBe(true);
    expect((await service.finishReading(id)).ok).toBe(true);
    expect(dependencies.extractBillWithAi).toHaveBeenCalledTimes(1);
  });
  it("bounds model failures to three attempts without losing OCR text", async () => {
    await service.readDocumentPage({
      id,
      pageIndex: 0,
      imageDataUrl: "data:image/png;base64,iVBORw0KGgo=",
    });
    dependencies.extractBillWithAi.mockImplementation(
      async (_text: string, options: ExtractionOptions) => {
        await options.beforeRequest?.();
        return {
          fields: emptyBillFields(),
          evidence: {},
          method: "labels",
          model: null,
          warning: "AI temporarily unavailable",
        };
      },
    );
    for (let i = 0; i < 3; i++)
      expect((await service.finishReading(id)).ok).toBe(true);
    expect((await service.finishReading(id)).ok).toBe(false);
    expect(dependencies.extractBillWithAi).toHaveBeenCalledTimes(3);
    const review = await service.loadReview(id);
    expect(review.ok && review.data.pages[0]?.text).toContain("Reading lamp");
  });
  it("charges repair calls atomically and retains the counters after completing extraction", async () => {
    await service.readDocumentPage({
      id,
      pageIndex: 0,
      imageDataUrl: "data:image/png;base64,iVBORw0KGgo=",
    });
    dependencies.extractBillWithAi.mockImplementation(
      async (_text: string, options: ExtractionOptions) => {
        expect(await options.beforeRequest?.()).toBe(true);
        expect(await options.beforeRequest?.()).toBe(true);
        return {
          fields: { ...emptyBillFields(), name: "Repaired name" },
          evidence: {},
          method: "nvidia-llm",
          model: "test-model",
          warning: null,
          diagnostics: {
            repairedName: true,
            fieldIssues: { name: "rejected" },
          },
        };
      },
    );
    expect((await service.finishReading(id)).ok).toBe(true);
    const [document] = await db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, id));
    expect(document?.extractedData?.["extraction"]).toMatchObject({
      version: 2,
      attempts: 2,
      status: "complete",
    });
    expect(document?.extractedData?.["extractionDiagnostics"]).toMatchObject({
      repairedName: true,
    });
    const review = await service.loadReview(id);
    expect(review.ok && review.data.nameIssue).toBe("rejected");
  });
  it("denies a repair when the primary request spent the last budget slot", async () => {
    await service.readDocumentPage({
      id,
      pageIndex: 0,
      imageDataUrl: "data:image/png;base64,iVBORw0KGgo=",
    });
    await db
      .update(schema.documents)
      .set({
        extractedData: {
          extraction: {
            version: 2,
            attempts: 2,
            status: "complete",
            method: "labels",
          },
        },
      })
      .where(eq(schema.documents.id, id));
    dependencies.extractBillWithAi.mockImplementation(
      async (_text: string, options: ExtractionOptions) => {
        expect(await options.beforeRequest?.()).toBe(true);
        expect(await options.beforeRequest?.()).toBe(false);
        return {
          fields: emptyBillFields(),
          evidence: {},
          method: "labels",
          model: null,
          warning: null,
        };
      },
    );
    expect((await service.finishReading(id)).ok).toBe(true);
    expect((await service.finishReading(id)).ok).toBe(false);
    const [document] = await db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, id));
    expect(document?.extractedData?.["extraction"]).toMatchObject({
      attempts: 3,
    });
  });
  it("upgrades a previous extraction version without replacing corrected fields", async () => {
    await service.readDocumentPage({
      id,
      pageIndex: 0,
      imageDataUrl: "data:image/png;base64,iVBORw0KGgo=",
    });
    await db
      .update(schema.documents)
      .set({
        extractedData: {
          extraction: {
            version: 1,
            attempts: 1,
            status: "complete",
            method: "nvidia-llm",
          },
          fields: emptyBillFields(),
        },
        draftFields: { name: "My name" },
      })
      .where(eq(schema.documents.id, id));
    expect((await service.finishReading(id)).ok).toBe(true);
    expect(
      dependencies.extractBillWithAi.mock.calls[0]![1].skipNameRepair,
    ).toBe(true);
    const review = await service.loadReview(id);
    expect(review.ok && review.data.fields.name).toBe("My name");
    const [document] = await db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, id));
    expect(document?.extractedData?.["extraction"]).toMatchObject({
      version: 2,
      attempts: 2,
    });
  });
});

describe("Assistant account isolation and quotas", () => {
  const request = {
    itemId: null,
    messages: [{ role: "user" as const, content: "What did I buy?" }],
  };
  it("allows the existing OCR key through the authenticated assistant configuration check", async () => {
    vi.stubEnv("NVIDIA_LLM_API_KEY", "");
    vi.stubEnv("NVIDIA_API_KEY", "");
    vi.stubEnv("NVIDIA_NEMOTRON_OCR_API_KEY", "shared-test-key");
    await db
      .insert(schema.items)
      .values({ id, userId: userA, name: "My bill" });
    expect((await askAssistant(request)).ok).toBe(true);
    expect(dependencies.answerFromBills).toHaveBeenCalledTimes(1);
    expect(
      (
        await pg.query("SELECT assistant_count FROM app_users WHERE id=$1", [
          userA,
        ])
      ).rows[0],
    ).toEqual({ assistant_count: 1 });
  });
  it("sends only the authenticated user's saved bills to the model", async () => {
    await db.insert(schema.items).values([
      { id, userId: userA, name: "My bill" },
      { userId: userB, name: "Private other bill" },
    ]);
    expect((await askAssistant(request)).ok).toBe(true);
    expect(
      dependencies.answerFromBills.mock.calls[0]![0].map(
        (bill: { name: string }) => bill.name,
      ),
    ).toEqual(["My bill"]);
  });
  it("rejects another user's item ID without calling the model", async () => {
    await db
      .insert(schema.items)
      .values({ id, userId: userB, name: "Private" });
    expect(await askAssistant({ ...request, itemId: id })).toMatchObject({
      ok: false,
      error: "Bill not found.",
    });
    expect(dependencies.answerFromBills).not.toHaveBeenCalled();
  });
  it("enforces daily and burst limits in the database", async () => {
    await db
      .insert(schema.items)
      .values({ id, userId: userA, name: "My bill" });
    await pg.query("UPDATE app_users SET assistant_count=39 WHERE id=$1", [
      userA,
    ]);
    expect((await askAssistant(request)).ok).toBe(true);
    expect((await askAssistant(request)).ok).toBe(false);
    expect(dependencies.answerFromBills).toHaveBeenCalledTimes(1);
    await pg.query(
      "UPDATE app_users SET assistant_window_started_at=now()-interval '2 days', assistant_last_requested_at=now()-interval '5 seconds' WHERE id=$1",
      [userA],
    );
    expect((await askAssistant(request)).ok).toBe(true);
    const usage = await pg.query(
      "SELECT assistant_count FROM app_users WHERE id=$1",
      [userA],
    );
    expect(usage.rows[0]).toEqual({ assistant_count: 1 });
  });
  it("bounds context to 50 bills and reports that the vault was truncated", async () => {
    await db.insert(schema.items).values(
      Array.from({ length: 51 }, (_, index) => ({
        userId: userA,
        name: `Bill ${index}`,
      })),
    );
    expect((await askAssistant(request)).ok).toBe(true);
    expect(dependencies.answerFromBills.mock.calls[0]![0]).toHaveLength(50);
    expect(dependencies.answerFromBills.mock.calls[0]![2]).toBe(true);
  });
  it("requires authentication before querying bills", async () => {
    dependencies.getAuthenticatedUserId.mockRejectedValueOnce(
      new Error("Sign in required"),
    );
    await expect(askAssistant(request)).rejects.toThrow("Sign in required");
    expect(dependencies.answerFromBills).not.toHaveBeenCalled();
  });
});

describe("Background processing and autosaved review", () => {
  it("reports browser processing availability when hosted job credentials are missing", async () => {
    dependencies.backgroundConfigured.mockReturnValue(false);
    await pg.query("UPDATE documents SET ocr_status='pending' WHERE id=$1", [
      id,
    ]);
    expect(await service.completeUpload(id)).toEqual({
      ok: true,
      data: { id, backgroundAvailable: false },
    });
    expect(await service.completeUpload(id)).toEqual({
      ok: true,
      data: { id, backgroundAvailable: false },
    });
    expect(dependencies.sendEvent).not.toHaveBeenCalled();
  });
  it("recovers a stale run with a new generation and stops after bounded recovery", async () => {
    await db.insert(schema.documentJobs).values({
      documentId: id,
      userId: userA,
      status: "reading",
      completedPages: 1,
      dispatchedAt: new Date(Date.now() - 3600000),
      updatedAt: new Date(Date.now() - 3600000),
    });
    await dispatchPendingJobs();
    expect((await db.select().from(schema.documentJobs))[0]).toMatchObject({
      generation: 2,
      status: "queued",
      completedPages: 1,
    });
    await pg.query(
      "UPDATE document_jobs SET generation=3, status='reading', updated_at=now()-interval '1 hour' WHERE document_id=$1",
      [id],
    );
    await dispatchPendingJobs();
    expect((await db.select().from(schema.documentJobs))[0]?.status).toBe(
      "failed",
    );
    expect((await service.loadReview(id)).ok).toBe(true);
  });
  it("queues a stored original and leaves a recoverable outbox when dispatch fails", async () => {
    await pg.query("UPDATE documents SET ocr_status='pending' WHERE id=$1", [
      id,
    ]);
    dependencies.sendEvent.mockRejectedValueOnce(new Error("Unavailable"));
    expect((await service.completeUpload(id)).ok).toBe(true);
    const [job] = await db.select().from(schema.documentJobs);
    expect(job).toMatchObject({
      documentId: id,
      userId: userA,
      status: "queued",
      dispatchedAt: null,
    });
    expect(dependencies.sendEvent.mock.calls[0]?.[0]).toMatchObject({
      data: { documentId: id, generation: 1 },
    });
    await service.completeUpload(id);
    expect(dependencies.sendEvent).toHaveBeenCalledTimes(2);
    expect(await db.select().from(schema.documentJobs)).toHaveLength(1);
  });
  it("finishes in the worker without a browser or authenticated request and reuses successful pages", async () => {
    await db
      .insert(schema.documentJobs)
      .values({ documentId: id, userId: userA });
    dependencies.getAuthenticatedUserId.mockRejectedValue(
      new Error("No browser session"),
    );
    await processPage(id, 1, 0);
    await processPage(id, 1, 0);
    await extractProcessedDocument(id, 1);
    expect(dependencies.readStoredOriginal).toHaveBeenCalledTimes(1);
    expect(dependencies.getAuthenticatedUserId).not.toHaveBeenCalled();
    const [document] = await db.select().from(schema.documents);
    const [job] = await db.select().from(schema.documentJobs);
    expect(document?.ocrStatus).toBe("review");
    expect(job).toMatchObject({ status: "complete", completedPages: 1 });
    expect(document?.extractedData?.["fields"]).toMatchObject({
      name: "Background lamp",
      invoiceNumber: "000045",
    });
  });
  it("preserves corrections made while OCR runs and exposes matching source pages", async () => {
    await db
      .insert(schema.documentJobs)
      .values({ documentId: id, userId: userA });
    expect(
      await service.autosaveReview({
        id,
        revision: 0,
        patch: { name: "My corrected name", purchasePrice: "171.00" },
      }),
    ).toEqual({ ok: true, data: { revision: 1 } });
    dependencies.extractBillWithAi.mockImplementationOnce(async (text) => ({
      fields: extractBillFields(text),
      evidence: { invoiceNumber: "Invoice number: 000045" },
      method: "nvidia-llm",
      model: "test-model",
      warning: null,
    }));
    await processPage(id, 1, 0);
    await extractProcessedDocument(id, 1);
    const review = await service.loadReview(id);
    expect(review.ok && review.data.fields).toMatchObject({
      name: "My corrected name",
      purchasePrice: "171.00",
      invoiceNumber: "000045",
    });
    expect(review.ok && review.data.evidence["invoiceNumber"]).toEqual({
      quote: "Invoice number: 000045",
      page: 0,
    });
  });
  it("rejects stale edits and other users, while accepting an identical retry after a lost response", async () => {
    const first = { id, revision: 0, patch: { name: "First edit" } };
    expect((await service.autosaveReview(first)).ok).toBe(true);
    expect((await service.autosaveReview(first)).ok).toBe(true);
    expect(
      (
        await service.autosaveReview({
          id,
          revision: 0,
          patch: { name: "Conflicting edit" },
        })
      ).ok,
    ).toBe(false);
    dependencies.getAuthenticatedUserId.mockResolvedValue(userB);
    expect(
      (
        await service.autosaveReview({
          id,
          revision: 1,
          patch: { name: "Wrong owner" },
        })
      ).ok,
    ).toBe(false);
    expect((await queueReading(id)).ok).toBe(false);
  });
  it("does not let stale generations overwrite a newer job or process saved bills", async () => {
    await db
      .insert(schema.documentJobs)
      .values({ documentId: id, userId: userA, generation: 2 });
    await processPage(id, 1, 0);
    await failJob(id, 1);
    expect(dependencies.readStoredOriginal).not.toHaveBeenCalled();
    expect((await db.select().from(schema.documentJobs))[0]?.status).toBe(
      "queued",
    );
    await service.saveBill({
      id,
      documentId: id,
      fields: { ...emptyBillFields(), name: "Manually saved" },
    });
    await processPage(id, 2, 0);
    expect(dependencies.readStoredOriginal).not.toHaveBeenCalled();
  });
  it("keeps completed pages and corrections through a failed job retry", async () => {
    await db
      .insert(schema.documentJobs)
      .values({ documentId: id, userId: userA });
    await processPage(id, 1, 0);
    await service.autosaveReview({
      id,
      revision: 0,
      patch: { serialNumber: "009999" },
    });
    await failJob(id, 1);
    expect((await queueReading(id)).ok).toBe(true);
    const [job] = await db.select().from(schema.documentJobs);
    expect(job?.generation).toBe(2);
    await processPage(id, 2, 0);
    await extractProcessedDocument(id, 2);
    expect(dependencies.readStoredOriginal).toHaveBeenCalledTimes(1);
    const review = await service.loadReview(id);
    expect(review.ok && review.data.fields.serialNumber).toBe("009999");
  });
});

describe("Reminder preferences and delivery", () => {
  async function dueReminder() {
    await service.saveBill({
      id,
      documentId: id,
      fields: {
        ...emptyBillFields(),
        name: "Owner's lamp",
        warrantyExpiresAt: "2099-10-01",
      },
    });
    await saveNotificationPreferences({
      emailReminders: true,
      timezone: "Asia/Kolkata",
      reminderHour: 9,
    });
    const emailRows = await pg.query<{ id: string }>(
      "SELECT id FROM reminders WHERE channel='email' AND status='scheduled' LIMIT 1",
    );
    const emailId = emailRows.rows[0]!.id;
    await pg.query(
      "UPDATE reminders SET remind_at=now()-interval '1 hour' WHERE id=$1",
      [emailId],
    );
    return emailId;
  }
  it("cancels an already-due schedule when the preferred local reminder time changes", async () => {
    const emailId = await dueReminder();
    expect(
      (
        await saveNotificationPreferences({
          emailReminders: true,
          timezone: "Asia/Kolkata",
          reminderHour: 10,
        })
      ).ok,
    ).toBe(true);
    expect(
      (await pg.query("SELECT status FROM reminders WHERE id=$1", [emailId]))
        .rows[0],
    ).toEqual({ status: "cancelled" });
    expect(await deliverReminder(emailId)).toEqual({ status: "skipped" });
    expect(dependencies.sendEmail).not.toHaveBeenCalled();
  });
  it("sends only to the verified account email and does not accept an arbitrary recipient", async () => {
    expect(
      (
        await saveNotificationPreferences({
          emailReminders: true,
          timezone: "Asia/Kolkata",
          reminderHour: 9,
        })
      ).ok,
    ).toBe(true);
    expect(
      (await db.select().from(schema.appUsers)).find(
        (user) => user.id === userA,
      )?.email,
    ).toBe("owner@example.invalid");
    dependencies.clerkGetUser.mockResolvedValueOnce({
      primaryEmailAddressId: "unverified",
      emailAddresses: [
        {
          id: "unverified",
          emailAddress: "unverified@example.invalid",
          verification: { status: "unverified" },
        },
      ],
    });
    expect(
      (
        await saveNotificationPreferences({
          emailReminders: true,
          timezone: "UTC",
          reminderHour: 9,
        })
      ).ok,
    ).toBe(false);
  });
  it("leaves email opt-in off by default and reports missing configuration", async () => {
    const notices = await loadNotifications();
    expect(notices.ok && notices.data.preferences.emailReminders).toBe(false);
    vi.stubEnv("RESEND_API_KEY", "");
    expect(
      (
        await saveNotificationPreferences({
          emailReminders: true,
          timezone: "UTC",
          reminderHour: 9,
        })
      ).ok,
    ).toBe(false);
    expect(await dueEmailIds()).toEqual([]);
  });
  it("delivers once under concurrent requests and uses a stable provider idempotency key", async () => {
    const emailId = await dueReminder();
    expect(await dueEmailIds()).toContain(emailId);
    await Promise.all([deliverReminder(emailId), deliverReminder(emailId)]);
    await deliverReminder(emailId);
    expect(dependencies.sendEmail).toHaveBeenCalledTimes(1);
    expect(dependencies.sendEmail.mock.calls[0]![0]).toMatchObject({
      to: "owner@example.invalid",
    });
    expect(dependencies.sendEmail.mock.calls[0]![1]).toMatchObject({
      idempotencyKey: `warrantly-reminder/${emailId}`,
    });
    expect(
      (
        await pg.query(
          "SELECT status, provider_message_id FROM reminders WHERE id=$1",
          [emailId],
        )
      ).rows[0],
    ).toEqual({ status: "sent", provider_message_id: "provider-id" });
  });
  it("retries a failed send with identical content even if bill details change", async () => {
    const emailId = await dueReminder();
    dependencies.sendEmail.mockRejectedValueOnce(new Error("Lost response"));
    await expect(deliverReminder(emailId)).rejects.toThrow(
      "Reminder delivery failed",
    );
    await pg.query("UPDATE items SET name='Changed name' WHERE id=$1", [id]);
    await deliverReminder(emailId);
    expect(dependencies.sendEmail.mock.calls[0]![0]).toEqual(
      dependencies.sendEmail.mock.calls[1]![0],
    );
    expect(dependencies.sendEmail.mock.calls[0]![1].idempotencyKey).toEqual(
      dependencies.sendEmail.mock.calls[1]![1].idempotencyKey,
    );
  });
  it("does not retry an ambiguous delivery outside the provider's deduplication window", async () => {
    const emailId = await dueReminder();
    await pg.query(
      "UPDATE reminders SET delivery_started_at=now()-interval '24 hours' WHERE id=$1",
      [emailId],
    );
    expect(await deliverReminder(emailId)).toEqual({ status: "failed" });
    expect(dependencies.sendEmail).not.toHaveBeenCalled();
  });
  it("never reuses a frozen email payload after the verified primary address changes", async () => {
    const emailId = await dueReminder();
    dependencies.sendEmail.mockRejectedValueOnce(new Error("Lost response"));
    await expect(deliverReminder(emailId)).rejects.toThrow(
      "Reminder delivery failed",
    );
    await pg.query(
      "UPDATE app_users SET email='new-owner@example.invalid' WHERE id=$1",
      [userA],
    );
    dependencies.clerkGetUser.mockResolvedValue({
      primaryEmailAddressId: "new-primary",
      emailAddresses: [
        {
          id: "new-primary",
          emailAddress: "new-owner@example.invalid",
          verification: { status: "verified" },
        },
      ],
    });
    expect(await deliverReminder(emailId)).toEqual({ status: "skipped" });
    expect(dependencies.sendEmail).toHaveBeenCalledTimes(1);
    expect(
      (await pg.query("SELECT status FROM reminders WHERE id=$1", [emailId]))
        .rows[0],
    ).toEqual({ status: "cancelled" });
  });
  it("blocks disabled, snoozed, dismissed and expired reminder emails", async () => {
    const emailId = await dueReminder();
    await pg.query(
      "UPDATE reminders SET snoozed_until=now()+interval '1 day' WHERE id=$1",
      [emailId],
    );
    expect(await deliverReminder(emailId)).toEqual({ status: "skipped" });
    await pg.query(
      "UPDATE reminders SET snoozed_until=NULL, status='cancelled' WHERE id=$1",
      [emailId],
    );
    expect(await deliverReminder(emailId)).toEqual({ status: "skipped" });
    await pg.query("UPDATE reminders SET status='scheduled' WHERE id=$1", [
      emailId,
    ]);
    await pg.query(
      "UPDATE items SET warranty_expires_at='2000-01-01' WHERE id=$1",
      [id],
    );
    expect(await deliverReminder(emailId)).toEqual({ status: "skipped" });
    expect(dependencies.sendEmail).not.toHaveBeenCalled();
  });
  it("owner-scopes snooze and dismiss and suppresses older due notices", async () => {
    await dueReminder();
    const rows = await pg.query<{ id: string }>(
      "SELECT id FROM reminders WHERE channel='in_app' AND status='scheduled' ORDER BY remind_at DESC",
    );
    const notice = rows.rows[0]!.id;
    dependencies.getAuthenticatedUserId.mockResolvedValue(userB);
    expect(
      (await actOnReminder({ id: notice, action: "dismiss", days: 1 })).ok,
    ).toBe(false);
    dependencies.getAuthenticatedUserId.mockResolvedValue(userA);
    expect(
      (await actOnReminder({ id: notice, action: "snooze", days: 1 })).ok,
    ).toBe(true);
    const snoozed = await pg.query(
      "SELECT snoozed_until FROM reminders WHERE channel='in_app' AND status='scheduled'",
    );
    expect(snoozed.rows.every((row) => row["snoozed_until"])).toBe(true);
    expect(
      (await actOnReminder({ id: notice, action: "dismiss", days: 1 })).ok,
    ).toBe(true);
    expect(
      (
        await pg.query("SELECT status FROM reminders WHERE channel='in_app'")
      ).rows.every((row) => row["status"] === "cancelled"),
    ).toBe(true);
  });
  it("preserves snooze and dismissal when saving unchanged preferences or unrelated bill details", async () => {
    await dueReminder();
    const [notice] = await db
      .select()
      .from(schema.reminders)
      .where(eq(schema.reminders.channel, "in_app"));
    await actOnReminder({ id: notice!.id, action: "snooze", days: 1 });
    const before = await db.select().from(schema.reminders);
    const fields = {
      ...emptyBillFields(),
      name: "Changed description",
      warrantyExpiresAt: "2099-10-01",
    };
    expect((await service.saveBill({ id, documentId: null, fields })).ok).toBe(
      true,
    );
    expect(
      (
        await saveNotificationPreferences({
          emailReminders: true,
          timezone: "Asia/Kolkata",
          reminderHour: 9,
        })
      ).ok,
    ).toBe(true);
    const after = await db.select().from(schema.reminders);
    expect(after).toEqual(before);
    await actOnReminder({ id: notice!.id, action: "dismiss", days: 1 });
    expect((await service.saveBill({ id, documentId: null, fields })).ok).toBe(
      true,
    );
    expect(
      (await db.select().from(schema.reminders)).find(
        (row) => row.id === notice!.id,
      )?.status,
    ).toBe("cancelled");
  });
});
