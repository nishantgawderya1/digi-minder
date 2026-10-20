import { describe, expect, it } from "vitest";
import {
  parseReceiptAmount,
  recoverPurchaseAmount,
  verifiedPurchaseAmount,
} from "@/lib/receipt-amounts";

describe("Printed monetary cells", () => {
  it.each([
    ["₹ 1,18,000.00", "INR", "118000.00"],
    ["Rs. 12,999", "", "12999.00"],
    ["(RM) 118.00", "", "118.00"],
    ["20,000", "Cash 100,000", "20000.00"],
    ["EUR 12,50", "", "12.50"],
    ["12.50e", "CB EMV SANS CONTACT EUR 12.50e", "12.50"],
    ["12.50e", "", null],
    ["12.50e3", "EUR", null],
    ["1.234,56 €", "", "1234.56"],
    ["48.000", "GRAND TOTAL 48.000\nTUNAI 50.000\nKEMBALI 2.000", "48000.00"],
    ["Rp. 48.000", "", "48000.00"],
    ["48.000", "IDR", "48000.00"],
    ["48.000", "USD", null],
    ["48.000", "INR", null],
    ["48.000", "", null],
    ["48.000", "IDR USD", null],
    ["118.00 3", "", null],
    ["3 118.00", "", null],
    ["INV-118.00", "", null],
    ["118.0000", "", null],
    ["-118.00", "", null],
    ["1,23,45", "", null],
    ["12345678901", "", null],
  ])(
    "parses the whole cell %s using reliable separator context",
    (raw, context, expected) => {
      expect(parseReceiptAmount(raw, context)).toBe(expected);
    },
  );
});

describe("Receipt amount evidence from real photo layouts", () => {
  it("recovers the actual French grocery receipt total with a misread euro symbol", () => {
    const source =
      "5 ARTICLE(S) TOTAL À PAYER 12.50e\nCB EMV SANS CONTACT EUR 12.50e\nTotaux: 0.64 11.86";
    expect(recoverPurchaseAmount(source)).toEqual({
      value: "12.50",
      quote: "5 ARTICLE(S) TOTAL À PAYER 12.50e",
    });
    expect(
      verifiedPurchaseAmount(
        "12.50",
        "5 ARTICLE(S) TOTAL À PAYER 12.50e",
        source,
      ),
    ).toBe(true);
    expect(verifiedPurchaseAmount("11.86", "Totaux: 0.64 11.86", source)).toBe(
      false,
    );
  });

  it("supports a clear paid-total label and separated amount line without choosing tax columns", () => {
    expect(recoverPurchaseAmount("Payé 9,50€")).toEqual({
      value: "9.50",
      quote: "Payé 9,50€",
    });
    expect(
      recoverPurchaseAmount("5 ARTICLE(S)      TOTAL A PAYER\n\n12.50€"),
    ).toEqual({
      value: "12.50",
      quote: "5 ARTICLE(S)      TOTAL A PAYER\n\n12.50€",
    });
    expect(
      recoverPurchaseAmount("TOTAL À PAYER illisible\nPayé 12,50€"),
    ).toBeNull();
  });
  it("excludes the item count and Indonesian change row on CORD test 012", () => {
    const source =
      "TOTAL (2 item) 120,000\nCC.Visa.BCA 120,000\nTotal Kembalian 0";
    expect(
      verifiedPurchaseAmount("120000.00", "TOTAL (2 item) 120,000", source),
    ).toBe(true);
    expect(
      verifiedPurchaseAmount("2.00", "TOTAL (2 item) 120,000", source),
    ).toBe(false);
    expect(verifiedPurchaseAmount("0.00", "Total Kembalian 0", source)).toBe(
      false,
    );
  });

  it("rejects CORD validation 002's actual shifted OCR cash/total rows", () => {
    const source =
      "20,000 20,000\n1 S-0valt ine\n50%\n1,818\nPB1:\n18,181\nSubtotal: 20,000\nTotal: 100,000\nCash:\n80,000\nCHANGE:\n10% Tax Inc luded";
    expect(verifiedPurchaseAmount("100000.00", "Total: 100,000", source)).toBe(
      false,
    );
    // There is no basis for fabricating a corrected final total from this broken OCR.
    expect(verifiedPurchaseAmount("20000.00", "20,000", source)).toBe(false);
  });

  it("accepts the correctly aligned CORD validation 002 total but not tender/change", () => {
    const source =
      "Subtotal: 18,181\nTotal: 20,000\nCash: 100,000\nCHANGE: 80,000";
    expect(verifiedPurchaseAmount("20000.00", "Total: 20,000", source)).toBe(
      true,
    );
    expect(verifiedPurchaseAmount("100000.00", "Cash: 100,000", source)).toBe(
      false,
    );
    expect(verifiedPurchaseAmount("80000.00", "CHANGE: 80,000", source)).toBe(
      false,
    );
  });

  it("reads CORD train 004's dot grouping without accepting a decimal prefix", () => {
    const source =
      "TOTAL 43.636\nTAX 10.00 % 4.364\nGRAND TOTAL 48.000\nTUNAI 50.000\nKEMBALI 2.000";
    expect(
      verifiedPurchaseAmount("48000.00", "GRAND TOTAL 48.000", source),
    ).toBe(true);
    expect(verifiedPurchaseAmount("48.00", "GRAND TOTAL 48.000", source)).toBe(
      false,
    );
    expect(verifiedPurchaseAmount("43636.00", "TOTAL 43.636", source)).toBe(
      false,
    );
  });

  it("does not choose a numeric column, conflicting total or unreadable stronger label", () => {
    for (const source of [
      "TOTAL 3 118.00",
      "TOTAL 118.00 3",
      "TOTAL 118.00\nTOTAL 120.00",
      "TOTAL 118.00\nGrand Total unreadable",
    ])
      expect(verifiedPurchaseAmount("118.00", source, source)).toBe(false);
  });

  it("keeps positive split tenders and explicit final totals valid", () => {
    const source = "Grand Total 150.00\nCash 50.00\nCredit Card 100.00";
    expect(verifiedPurchaseAmount("150.00", "Grand Total 150.00", source)).toBe(
      true,
    );
    const paid = "Grand Total 1180.00\nCash 1180.00\nAmount Due 0.00";
    expect(verifiedPurchaseAmount("1180.00", "1180.00", paid)).toBe(true);
  });

  it.each(["Total", "Grand Total", "Net Payable", "Amount Paid"])(
    "rejects contradictory cash/change arithmetic even for %s",
    (label) => {
      const quote = `${label} 100.00`;
      const source = `${quote}\nCash 100.00\nChange 80.00`;
      expect(verifiedPurchaseAmount("100.00", quote, source)).toBe(false);
      expect(recoverPurchaseAmount(source)).toBeNull();
    },
  );

  it("does not borrow a total role from another occurrence of an MRP quote", () => {
    const source = "MRP INR 1180.00\nGrand Total INR 1180.00";
    expect(verifiedPurchaseAmount("1180.00", "MRP INR 1180.00", source)).toBe(
      false,
    );
    expect(
      verifiedPurchaseAmount("1180.00", "Grand Total INR 1180.00", source),
    ).toBe(true);
  });
});
