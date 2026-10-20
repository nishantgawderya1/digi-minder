import { describe, expect, it } from "vitest";
import { extractBillFields } from "@/lib/ocr";

// Short, non-identifying OCR excerpts from public photographed receipts.
// Attribution and the distinction between image OCR and replay are in
// docs/real-receipt-validation.md. No original photos are bundled here.
describe("real receipt OCR fallback regressions", () => {
  it("rejects the cash value mispaired with Total on a tilted CORD receipt", () => {
    const fields = extractBillFields(
      "1 S-0valt ine\nSubtotal: 20,000\nTotal: 100,000\nCash:\n80,000\nCHANGE:",
    );
    expect(fields).toMatchObject({
      brand: null,
      purchasePrice: null,
      purchaseDate: null,
    });
  });

  it("accepts the same receipt's correctly aligned total, not tender or change", () => {
    expect(
      extractBillFields(
        "1 S-Ovaltine\nSubtotal: 18,181\nTotal: 20,000\nCash: 100,000\nCHANGE: 80,000",
      ).purchasePrice,
    ).toBe("20000.00");
  });

  it("reads a French total and dated POS timestamp without treating item count as price", () => {
    expect(
      extractBillFields(
        "5 ARTICLE(S) TOTAL À PAYER 12.50e\nCB EMV SANS CONTACT EUR 12.50e\nTotaux: 0.64 11.86\n0009 002 000289 25/07/2021 16:29:12",
      ),
    ).toMatchObject({
      brand: null,
      purchasePrice: "12.50",
      purchaseDate: "2021-07-25",
      currency: "EUR",
    });
  });

  it("handles an independently printed paid amount and French timestamp", () => {
    expect(extractBillFields("Payé 9,50€\n11/12/2022 12h42")).toMatchObject({
      purchasePrice: "9.50",
      purchaseDate: "2022-12-11",
      currency: "EUR",
    });
  });

  it("keeps an unreadable receipt date blank instead of using a footer date", () => {
    expect(
      extractBillFields("Date: unreadable\n25/07/2021 16:29:12").purchaseDate,
    ).toBeNull();
  });

  it("preserves grouped rupiah and excludes item counts and change", () => {
    expect(
      extractBillFields("GRAND TOTAL 48.000\nTunai 50.000\nKembalian Rp 2.000"),
    ).toMatchObject({ purchasePrice: "48000.00", currency: "IDR" });
    expect(
      extractBillFields("TOTAL (2 item) 120,000\nTotal Kembalian 0")
        .purchasePrice,
    ).toBe("120000.00");
  });
});
