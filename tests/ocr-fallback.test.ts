import { describe, expect, it } from "vitest";
import { extractBillFields, readOcrResponse } from "@/lib/ocr";
import { emptyBillFields } from "@/lib/bills";

describe("labelled receipt fallback", () => {
  it.each([
    "Total: 100.00\nGrand Total: INR 118.00",
    "Grand Total: INR 118.00\nTotal: 100.00",
    "Total: 100.00\nAmount due: 0.00\nAmount paid: 118.00",
  ])("prefers the final purchase amount over earlier totals: %s", (text) => {
    expect(extractBillFields(text).purchasePrice).toBe("118.00");
  });

  it("keeps fields in adjacent labelled columns separate", () => {
    expect(
      extractBillFields(
        "Product name: Reading Lamp Model: L-20\nBrand: Acme Manufacturer: Example Manufacturing Ltd\nSeller: Local Shop Buyer: Test Customer\nInvoice No: INV-00012 Order No: ORDER-999\nSerial number: 000001 Barcode: 00012345\nPurchase date: 02/10/2026 Delivery date: 04/10/2026\nWarranty: 1 year Return window: 30 days",
      ),
    ).toMatchObject({
      name: "Reading Lamp",
      modelNumber: "L-20",
      brand: "Acme",
      retailer: "Local Shop",
      invoiceNumber: "INV-00012",
      serialNumber: "000001",
      barcode: "00012345",
      purchaseDate: "2026-10-02",
      warrantyMonths: 12,
      returnWindowDays: 30,
      warrantyExpiresAt: "2027-10-02",
      returnExpiresAt: "2026-11-01",
    });
  });

  it("does not confuse order dates, customers or product names with purchase roles", () => {
    expect(
      extractBillFields(
        "ACME ELECTRONICS\nCustomer name: Apple Store\nOrder date: 01/10/2026\nDue date: 10/10/2026\nExpiry date: 02/10/2027\nProduct name: Model Home Light\nOrder Number: 000999",
      ),
    ).toMatchObject({
      name: "Model Home Light",
      retailer: null,
      brand: null,
      modelNumber: null,
      purchaseDate: null,
      invoiceNumber: null,
    });
    expect(
      extractBillFields("Date: 01/10/2026\nInvoice date: 02/10/2026")
        .purchaseDate,
    ).toBe("2026-10-02");
  });

  it("only uses an explicit brand or manufacturer label, including a value on the next row", () => {
    expect(
      extractBillFields("Acme Store\nProduct name: Acme Reading Lamp").brand,
    ).toBeNull();
    expect(
      extractBillFields("Manufacturer: Example Manufacturing Ltd").brand,
    ).toBe("Example Manufacturing Ltd");
    expect(extractBillFields("Brand:\nAcme\nModel: L-20")).toMatchObject({
      brand: "Acme",
      modelNumber: "L-20",
    });
    expect(extractBillFields("Brand:\n\nAcme").brand).toBeNull();
  });

  it("leaves conflicting same-priority facts blank instead of selecting the first item", () => {
    expect(
      extractBillFields(
        "Product name: Reading Lamp\nBrand: Acme\nProduct name: USB Cable\nBrand: Example\nGrand Total: 200.00\nGrand Total: 210.00",
      ),
    ).toMatchObject({ name: "", brand: null, purchasePrice: null });
    expect(extractBillFields("Brand: Acme\nBrand: Acme").brand).toBe("Acme");
  });

  it("does not merge purchase facts from separate invoices in a document", () => {
    expect(
      extractBillFields(
        "Invoice No: SHIPPING001\nSeller: Courier\nTotal: 50.00\n\nInvoice No: GOODS00001\nProduct name: Reading Lamp\nGrand Total: 1180.00",
      ),
    ).toEqual(emptyBillFields());
    expect(
      extractBillFields(
        "Invoice No: 00001\nProduct name: Reading Lamp\n\nInvoice No: 00001\nGrand Total: 1180.00",
      ),
    ).toMatchObject({
      invoiceNumber: "00001",
      name: "Reading Lamp",
      purchasePrice: "1180.00",
    });
  });

  it("never replaces the final invoice total with a paid bill's remaining balance", () => {
    expect(
      extractBillFields(
        "Subtotal: 1000.00\nTotal: 1000.00\nGrand Total: INR 1180.00\nAmount due: 0.00\nBalance: 0.00",
      ).purchasePrice,
    ).toBe("1180.00");
  });

  it("does not fall back to a line-item total when the final amount is unreadable", () => {
    expect(
      extractBillFields("Total: 100.00\nGrand Total: unreadable").purchasePrice,
    ).toBeNull();
    expect(
      extractBillFields("Total: 100.00\nGrand Total:").purchasePrice,
    ).toBeNull();
    expect(
      extractBillFields(
        "Product Description Qty Price Discount Total\nSubtotal: 100.00",
      ),
    ).toMatchObject({ name: "", purchasePrice: null });
  });

  it("preserves zero-valued identifiers and explicit durations", () => {
    expect(
      extractBillFields(
        "Serial No: 0000 Model No: 001\nInvoice No: 00001\nWarranty: 0 months Return period: 0 days\nDate: 01/10/2026",
      ),
    ).toMatchObject({
      serialNumber: "0000",
      modelNumber: "001",
      invoiceNumber: "00001",
      warrantyMonths: 0,
      returnWindowDays: 0,
      warrantyExpiresAt: "2026-10-01",
      returnExpiresAt: "2026-10-01",
    });
  });
});

describe("positioned OCR columns", () => {
  const word = (text: string, x: number, right: number, y: number) => ({
    text_prediction: { text, confidence: 0.99 },
    bounding_box: {
      points: [
        { x, y },
        { x: right, y: y + 12 },
      ],
    },
  });

  it("preserves a clear column boundary without breaking ordinary label/value spacing", () => {
    const { text } = readOcrResponse({
      data: [
        {
          text_detections: [
            word("L-20", 510, 550, 10),
            word("Acme", 70, 110, 10),
            word("Brand:", 0, 50, 10),
            word("Model:", 440, 490, 10),
            word("118.00", 100, 150, 40),
            word("Grand Total:", 0, 85, 40),
          ],
        },
      ],
    });
    expect(text).toBe("Brand: Acme\tModel: L-20\nGrand Total: 118.00");
    expect(extractBillFields(text)).toMatchObject({
      brand: "Acme",
      modelNumber: "L-20",
      purchasePrice: "118.00",
    });
  });

  it("never combines rows from different pages with identical coordinates", () => {
    const { text } = readOcrResponse({
      data: [
        { text_detections: [word("Brand: Acme", 0, 100, 10)] },
        { text_detections: [word("Invoice No: INV-0001", 0, 180, 10)] },
      ],
    });
    expect(text).toBe("Brand: Acme\n\nInvoice No: INV-0001");
    expect(extractBillFields(text)).toMatchObject({
      brand: "Acme",
      invoiceNumber: "INV-0001",
    });
  });
});
