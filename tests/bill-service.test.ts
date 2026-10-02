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
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import * as schema from "@/db/schema";
import { emptyBillFields } from "@/lib/bills";
import { extractBillFields } from "@/lib/ocr";
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
}));
vi.mock("@/db/index.server", () => ({ getDatabase: dependencies.getDatabase }));
vi.mock("@/lib/auth.server", () => ({
  getAuthenticatedUserId: dependencies.getAuthenticatedUserId,
}));
vi.mock("@/lib/ocr.server", () => ({ runOcr: dependencies.runOcr }));
vi.mock("@/lib/assistant-model.server", () => ({
  answerFromBills: dependencies.answerFromBills,
}));
vi.mock("@/lib/bill-extraction.server", () => ({
  extractBillWithAi: dependencies.extractBillWithAi,
  EXTRACTION_VERSION: 1,
}));
vi.mock("@/lib/storage.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage.server")>()),
  signedDownload: dependencies.signedDownload,
  deleteStoredFile: dependencies.deleteStoredFile,
  signedUpload: dependencies.signedUpload,
  finalizeUpload: dependencies.finalizeUpload,
  storageConfigured: () => true,
}));
import * as service from "@/lib/bill-service.server";
import { askAssistant } from "@/lib/assistant-service.server";

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
  dependencies.answerFromBills.mockResolvedValue({
    answer: "Grounded answer",
    sources: [],
  });
  vi.stubEnv("NVIDIA_NEMOTRON_OCR_API_KEY", "test-key-not-real");
  vi.stubEnv("NVIDIA_LLM_API_KEY", "test-key-not-real");
  dependencies.extractBillWithAi.mockImplementation(async (text: string) => ({
    fields: extractBillFields(text),
    evidence: {},
    method: "nvidia-llm",
    model: "test-model",
    warning: null,
  }));
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
    dependencies.extractBillWithAi.mockResolvedValue({
      fields: emptyBillFields(),
      evidence: {},
      method: "labels",
      model: null,
      warning: "AI temporarily unavailable",
    });
    for (let i = 0; i < 3; i++)
      expect((await service.finishReading(id)).ok).toBe(true);
    expect((await service.finishReading(id)).ok).toBe(false);
    expect(dependencies.extractBillWithAi).toHaveBeenCalledTimes(3);
    const review = await service.loadReview(id);
    expect(review.ok && review.data.pages[0]?.text).toContain("Reading lamp");
  });
});

describe("Assistant account isolation and quotas", () => {
  const request = {
    itemId: null,
    messages: [{ role: "user" as const, content: "What did I buy?" }],
  };
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
