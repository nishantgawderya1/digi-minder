import { format, isValid, parse } from "date-fns";

export function readReceiptDate(value: string | null) {
  if (!value) return null;
  const clean = value.trim().replace(/(\d)(st|nd|rd|th)\b/gi, "$1");
  // Numeric receipts use day-first order. A fixed reference keeps two-digit
  // years deterministic (1950–2049), independent of today's date.
  for (const pattern of [
    "yyyy-MM-dd",
    "yyyy/MM/dd",
    "yyyy.MM.dd",
    "d/M/yyyy",
    "d-M-yyyy",
    "d.M.yyyy",
    "d MMM yyyy",
    "d MMMM yyyy",
    "d-MMM-yyyy",
    "d/MMM/yyyy",
    "MMM d, yyyy",
    "MMMM d, yyyy",
    "MMM d yyyy",
    "d/M/yy",
    "d-M-yy",
    "d.M.yy",
    "d-MMM-yy",
    "d MMM yy",
    "MM/dd/yyyy",
  ]) {
    const parsed = parse(clean, pattern, new Date(2000, 0, 1));
    if (
      isValid(parsed) &&
      parsed.getFullYear() >= 1900 &&
      parsed.getFullYear() <= 2200
    )
      return format(parsed, "yyyy-MM-dd");
  }
  return null;
}

export function findReceiptDates(text: string) {
  const expression =
    /(?<![\p{L}\p{N}])(?:\d{4}[/.-]\d{1,2}[/.-]\d{1,2}|\d{1,2}[/.-]\d{1,2}[/.-](?:\d{4}|\d{2})|\d{1,2}(?:st|nd|rd|th)?[ /-]+[A-Za-z]+[ /-]+(?:\d{4}|\d{2})|[A-Za-z]+\s+\d{1,2},?\s+\d{4})(?![\p{L}\p{N}])/gu;
  return [...text.matchAll(expression)].flatMap(([token]) => {
    const value = readReceiptDate(token);
    return value ? [{ token, value }] : [];
  });
}
