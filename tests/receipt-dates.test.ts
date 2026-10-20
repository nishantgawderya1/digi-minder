import { describe, expect, it } from "vitest";
import { findReceiptDates, readReceiptDate } from "@/lib/receipt-dates";

describe("printed receipt dates", () => {
  it.each([
    ["25/07/2021", "2021-07-25"],
    ["11/12/2022", "2022-12-11"],
    ["06/02/18", "2018-02-06"],
    ["2018/02/06", "2018-02-06"],
    ["06-Feb-2018", "2018-02-06"],
    ["6 Feb 18", "2018-02-06"],
    ["02/10/2026", "2026-10-02"],
    ["31.12.99", "1999-12-31"],
    ["29/02/2024", "2024-02-29"],
    ["Oct 2, 2026", "2026-10-02"],
  ])("reads %s without guessing a new date", (token, expected) => {
    expect(readReceiptDate(token)).toBe(expected);
  });
  it.each([
    "31/02/2021",
    "00/00/00",
    "29/02/2023",
    "unreadable",
    "20211020",
    "20/20/2026",
    "12/10/2300",
  ])("leaves invalid or unprinted dates blank: %s", (token) => {
    expect(readReceiptDate(token)).toBeNull();
  });
  it("finds the visible date in actual receipt timestamp layouts", () => {
    expect(findReceiptDates("0009 002 000289 25/07/2021 16:29:12")).toEqual([
      { token: "25/07/2021", value: "2021-07-25" },
    ]);
    expect(findReceiptDates("11/12/2022 12h42")).toEqual([
      { token: "11/12/2022", value: "2022-12-11" },
    ]);
  });
  it("does not match partial dates in longer identifier tokens", () => {
    expect(findReceiptDates("SN2018/02/06X 12/10/20261")).toEqual([]);
  });
});
