import { describe, expect, it } from "vitest";
import {
  billFieldsSchema,
  deadlineFromDuration,
  emptyBillFields,
  reminderSchedule,
  saveBillSchema,
  totalsByCurrency,
  warrantyState,
} from "@/lib/bills";
import { extractBillFields, readOcrResponse } from "@/lib/ocr";
import { matchesFileSignature, uploadKey } from "@/lib/storage.server";

describe("Bill validation and dates", () => {
  it("does not invent missing bill facts", () => {
    const fields = extractBillFields("Unlabelled unreadable receipt");
    expect(fields).toEqual(emptyBillFields());
    expect(fields.purchaseDate).toBeNull();
    expect(fields.warrantyMonths).toBeNull();
    expect(fields.purchasePrice).toBeNull();
  });
  it("requires a name and rejects invalid, negative and overprecision prices", () => {
    const draft = {
      id: "b6cdcefe-31e9-4244-9469-5e4aefad074a",
      documentId: null,
      fields: emptyBillFields(),
    };
    expect(saveBillSchema.safeParse(draft).success).toBe(false);
    for (const purchasePrice of ["-1", "2.123", "NaN", "100000000000"])
      expect(
        billFieldsSchema.safeParse({ ...draft.fields, purchasePrice }).success,
      ).toBe(false);
    expect(
      billFieldsSchema.safeParse({
        ...draft.fields,
        purchaseDate: "2026-02-30",
      }).success,
    ).toBe(false);
    expect(
      saveBillSchema.safeParse({
        ...draft,
        fields: {
          ...draft.fields,
          name: "A receipt",
          purchaseDate: "2026-02-01",
          warrantyExpiresAt: "2026-01-01",
        },
      }).success,
    ).toBe(false);
    expect(
      billFieldsSchema.safeParse({ ...draft.fields, userId: "other-user" })
        .success,
    ).toBe(false);
  });
  it("uses calendar months and never shifts an end-of-month purchase into the wrong month", () => {
    expect(deadlineFromDuration("2024-01-31", 1, "months")).toBe("2024-02-29");
    expect(deadlineFromDuration("2026-01-31", 1, "months")).toBe("2026-02-28");
    expect(deadlineFromDuration(null, 12, "months")).toBeNull();
  });
  it("keeps warranty active through its last calendar day and clamps progress", () => {
    expect(
      warrantyState(
        { purchaseDate: "2026-01-01", warrantyExpiresAt: "2026-10-02" },
        new Date(2026, 9, 2, 23, 59),
      ).label,
    ).toBe("Ends today");
    expect(
      warrantyState(
        { purchaseDate: "2026-01-01", warrantyExpiresAt: "2026-10-02" },
        new Date(2026, 9, 3),
      ).percent,
    ).toBe(0);
    expect(
      warrantyState({ purchaseDate: null, warrantyExpiresAt: null }).status,
    ).toBe("unknown");
  });
  it("does not combine unrelated currencies or include unknown prices", () => {
    const totals = totalsByCurrency([
      { purchasePrice: "0.10", currency: "INR" },
      { purchasePrice: "0.20", currency: "INR" },
      { purchasePrice: "10", currency: "USD" },
      { purchasePrice: null, currency: "EUR" },
    ]);
    expect(totals).toHaveLength(2);
    expect(totals[0]).toContain("0.30");
    expect(totals[1]).toContain("10.00");
  });
  it("deduplicates reminder offsets and omits dates already past", () => {
    const scheduled = reminderSchedule(
      {
        ...emptyBillFields(),
        warrantyExpiresAt: "2026-10-20",
        returnExpiresAt: "2026-10-10",
        reminderDays: [30, 7, 7, 1],
      },
      new Date("2026-10-05T00:00:00Z"),
    );
    expect(scheduled).toHaveLength(3);
    expect(scheduled.filter((r) => r.deadlineType === "return")).toHaveLength(
      1,
    );
    expect(
      reminderSchedule({ ...emptyBillFields(), reminderDays: [] }),
    ).toEqual([]);
  });
});

describe("NVIDIA OCR adapter", () => {
  it("reconstructs a row from out-of-order word boxes", () => {
    const detection = (text: string, x: number, y: number) => ({
      text_prediction: { text, confidence: 0.9 },
      bounding_box: {
        points: [
          { x, y },
          { x: x + 20, y: y + 10 },
        ],
      },
    });
    const result = readOcrResponse({
      data: [
        {
          text_detections: [
            detection("120.00", 70, 50),
            detection("Total:", 0, 50),
            detection("Receipt", 0, 10),
          ],
        },
      ],
    });
    expect(result.text).toBe("Receipt\nTotal: 120.00");
    expect(result.confidence).toBeCloseTo(0.9);
    expect(() => readOcrResponse({ text: "invented format" })).toThrow();
  });
  it("reads only labelled facts and preserves leading zeroes in identifiers", () => {
    const result = extractBillFields(
      "Product name: Desk lamp\nStore: Local shop\nInvoice No: INV-002\nSerial number: 001234\nBarcode: 0099887766\nModel: L-20\nInvoice date: 01/10/2026\nSubtotal: 1,000.00\nGrand Total: INR 1,180.50\nWarranty: 1 year\nReturn window: 30 days",
    );
    expect(result).toMatchObject({
      name: "Desk lamp",
      retailer: "Local shop",
      invoiceNumber: "INV-002",
      serialNumber: "001234",
      barcode: "0099887766",
      modelNumber: "L-20",
      purchaseDate: "2026-10-01",
      purchasePrice: "1180.50",
      currency: "INR",
      warrantyMonths: 12,
      warrantyExpiresAt: "2027-10-01",
      returnExpiresAt: "2026-10-31",
    });
    expect(result.category).toBeNull();
  });
  it("leaves ambiguous amount words and impossible dates blank", () => {
    expect(
      extractBillFields("Total: One hundred only\nDate: 31/02/2026"),
    ).toMatchObject({ purchasePrice: null, purchaseDate: null });
  });
});

describe("Original file validation", () => {
  it("rejects renamed scripts and mismatching file types", () => {
    expect(
      matchesFileSignature(
        Buffer.from("<script>alert(1)</script>"),
        "image/jpeg",
      ),
    ).toBe(false);
    expect(
      matchesFileSignature(Buffer.from("%PDF-1.7"), "application/pdf"),
    ).toBe(true);
    expect(
      matchesFileSignature(Buffer.from([255, 216, 255]), "image/jpeg"),
    ).toBe(true);
    expect(
      matchesFileSignature(Buffer.from([255, 216, 255]), "image/png"),
    ).toBe(false);
    expect(uploadKey("user/a", "file-id")).toBe(
      "users/user%2Fa/pending/file-id",
    );
  });
});
