import { describe, expect, it } from "vitest";
import { readFieldIssues } from "@/lib/review";

describe("review field diagnostics", () => {
  it("preserves per-field problems without trusting arbitrary diagnostic fields", () => {
    expect(
      readFieldIssues({
        brand: "ambiguous",
        purchasePrice: "rejected",
        purchaseDate: "unreadable",
        ownerId: "rejected",
        invoiceNumber: false,
        name: "missing",
      }),
    ).toEqual({
      brand: "ambiguous",
      purchasePrice: "rejected",
      purchaseDate: "unreadable",
      name: "missing",
    });
  });
  it.each([null, undefined, "invalid", [], false])(
    "handles missing or malformed older diagnostics: %j",
    (value) => {
      expect(readFieldIssues(value)).toEqual({});
    },
  );
});
