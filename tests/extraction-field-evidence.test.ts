import { describe, expect, it } from "vitest";
import {
  recoverLabeledBrand,
  supportsBrand,
  supportsFieldRole,
  supportsProductToken,
  supportsRetailer,
} from "@/lib/extraction-field-evidence";

describe("Printed field roles", () => {
  const text = `Invoice No: INV-00123 Order ID: ORDER-00999
GSTIN: 12345ABC
Serial Number: 0000123
Model: L-20
EAN: 00998877
MRP: INR 2000.00
Subtotal: INR 1000.00
Tax: INR 180.00
Total: INR 1000.00
Grand Total: INR 1180.00
Order Date: 01/10/2026
Delivery Date: 06/10/2026
Invoice Date: 02/10/2026
Warranty: 1 year
Return window: 30 days`;

  it.each([
    ["invoiceNumber", "INV-00123"],
    ["serialNumber", "0000123"],
    ["modelNumber", "L-20"],
    ["barcode", "00998877"],
    ["purchasePrice", "1180.00"],
    ["purchaseDate", "02/10/2026"],
    ["warrantyMonths", "1 year"],
    ["returnWindowDays", "30 days"],
  ] as const)("supports %s with its actual source label", (field, token) => {
    expect(supportsFieldRole(field, token, text)).toBe(true);
  });

  it.each([
    ["invoiceNumber", "ORDER-00999"],
    ["modelNumber", "ORDER-00999"],
    ["barcode", "0000123"],
    ["invoiceNumber", "12345ABC"],
    ["purchasePrice", "2000.00"],
    ["purchasePrice", "1000.00"],
    ["purchasePrice", "180.00"],
    ["purchaseDate", "01/10/2026"],
    ["purchaseDate", "06/10/2026"],
    ["warrantyMonths", "30 days"],
    ["returnWindowDays", "1 year"],
  ] as const)("rejects %s mapped from another role: %s", (field, token) => {
    expect(supportsFieldRole(field, token, text)).toBe(false);
  });

  it("handles a value below its label without treating document titles as ID labels", () => {
    expect(
      supportsFieldRole("invoiceNumber", "000123", "Invoice Number:\n000123"),
    ).toBe(true);
    expect(
      supportsFieldRole("invoiceNumber", "Acme Lamp", "Tax Invoice\nAcme Lamp"),
    ).toBe(false);
    expect(supportsFieldRole("purchasePrice", "170", "Total\n170")).toBe(true);
  });

  it("accepts a generic Total and Date when the receipt has no more specific labels", () => {
    expect(supportsFieldRole("purchasePrice", "170", "Total 170")).toBe(true);
    expect(
      supportsFieldRole("purchaseDate", "02/10/2026", "Date: 02/10/2026"),
    ).toBe(true);
  });

  it("does not mistake an outstanding balance for the invoice total", () => {
    const receipt =
      "Grand Total INR 1180.00\nCash INR 1180.00\nAmount Due INR 0.00\nBalance Due INR 0.00";
    expect(supportsFieldRole("purchasePrice", "0.00", receipt)).toBe(false);
    expect(supportsFieldRole("purchasePrice", "1180.00", receipt)).toBe(true);
  });

  it("does not borrow role support from a different occurrence when the quoted label is wrong", () => {
    const receipt = "MRP INR 1180.00\nGrand Total INR 1180.00";
    expect(
      supportsFieldRole("purchasePrice", "1180.00", receipt, "MRP INR 1180.00"),
    ).toBe(false);
    expect(
      supportsFieldRole("purchasePrice", "1180.00", receipt, "1180.00"),
    ).toBe(true);
  });

  it("does not treat identifier substrings as separate values", () => {
    expect(
      supportsFieldRole("invoiceNumber", "123", "Invoice No: INV1234"),
    ).toBe(false);
    expect(supportsProductToken("1", "Acme Phone A14")).toBe(false);
  });
});

describe("Source-backed maker identification", () => {
  it("allows explicit makers and product brands without inferring compatible-device brands", () => {
    const name = "Acme Cover compatible with Apple iPhone";
    const text = `Seller: Apple Store\nProduct name: ${name}\nManufacturer: Acme`;
    expect(supportsBrand("Acme", text, name)).toBe(true);
    expect(supportsBrand("Apple", text, name)).toBe(false);
    expect(
      supportsBrand(
        "Apple",
        "Product name: Apple iPhone 14",
        "Apple iPhone 14",
      ),
    ).toBe(true);
    expect(supportsBrand("Apple", "Retailer: Apple Store", "")).toBe(false);
    expect(supportsBrand("Acme", "Buyer: Acme", "")).toBe(false);
  });

  it.each([
    "for",
    "fits",
    "compatible with",
    "suitable for",
    "designed for",
    "works with",
  ])("does not use a brand after %s as the accessory's maker", (phrase) =>
    expect(
      supportsBrand(
        "Apple",
        `Acme Cover ${phrase} Apple`,
        `Acme Cover ${phrase} Apple`,
      ),
    ).toBe(false),
  );

  it("recovers a unique labeled brand and preserves its printed evidence", () => {
    expect(
      recoverLabeledBrand("Store: Local Shop\nBrand: Acme Model: X1"),
    ).toEqual({
      value: "Acme",
      quote: "Brand: Acme Model: X1",
    });
    expect(recoverLabeledBrand("Manufacturer:\nAcme Electronics")).toEqual({
      value: "Acme Electronics",
      quote: "Manufacturer:\nAcme Electronics",
    });
  });

  it("does not recover makers from words inside product prose", () => {
    for (const text of [
      "Product name: Brand New Shoes",
      "Item: Manufacturer recommended adapter",
      "Description: Lightweight brand name printed sleeve",
    ])
      expect(recoverLabeledBrand(text)).toBeNull();
    expect(
      supportsBrand("New Shoes", "Product name: Brand New Shoes", ""),
    ).toBe(false);
  });

  it("recognizes real maker labels at structured cell boundaries or with explicit punctuation", () => {
    for (const text of [
      "Brand Acme",
      "Item | Brand Acme",
      "Item\tBrand Acme",
      "Item  Brand Acme",
      "Product Brand: Acme",
      "Product Manufacturer# Acme",
    ])
      expect(recoverLabeledBrand(text)?.value).toBe("Acme");
  });

  it("prefers printed Brand over OEM Manufacturer and requires a unique preferred value", () => {
    expect(
      recoverLabeledBrand("Brand: Acme\nManufacturer: OEM Factory"),
    ).toEqual({
      value: "Acme",
      quote: "Brand: Acme",
    });
    expect(
      recoverLabeledBrand(
        "Brand: Acme\nBrand: Other\nManufacturer: OEM Factory",
      ),
    ).toBeNull();
    expect(
      recoverLabeledBrand(
        "Brand: Acme\nManufacturer: First Factory\nManufacturer: Second Factory",
      )?.value,
    ).toBe("Acme");
  });

  it("does not choose among conflicting makers or turn placeholders/another label into a brand", () => {
    for (const text of [
      "Brand: Acme\nBrand: Other",
      "Brand: Unknown",
      "Brand:\nModel: A1",
      "Brand: 12345",
      "Retailer: Acme",
    ])
      expect(recoverLabeledBrand(text)).toBeNull();
  });

  it("does not use buyer or maker roles as the retailer", () => {
    expect(supportsRetailer("Test Buyer", "Buyer: Test Buyer")).toBe(false);
    expect(supportsRetailer("Acme", "Manufacturer: Acme")).toBe(false);
    expect(
      supportsRetailer("Acme Store", "Acme Store\nInvoice No: 000123"),
    ).toBe(true);
    expect(supportsRetailer("Acme Store", "Sold by: Acme Store")).toBe(true);
  });
});
