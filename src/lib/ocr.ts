import { format, isValid, parse } from "date-fns";
import { z } from "zod";
import {
  deadlineFromDuration,
  emptyBillFields,
  type BillFields,
} from "./bills";

const detectionSchema = z.object({
  text_prediction: z.object({
    text: z.string(),
    confidence: z.number().min(0).max(1).optional(),
  }),
  bounding_box: z
    .object({
      points: z.array(z.object({ x: z.number(), y: z.number() })).min(2),
    })
    .optional(),
});
const responseSchema = z.object({
  data: z.array(z.object({ text_detections: z.array(detectionSchema) })),
});

export function readOcrResponse(payload: unknown) {
  const parsed = responseSchema.parse(payload);
  const detections = parsed.data
    .flatMap((page) => page.text_detections)
    .filter((d) => d.text_prediction.text.trim());
  const positioned = detections
    .map((d, order) => {
      const points = d.bounding_box?.points;
      const top = points ? Math.min(...points.map((p) => p.y)) : order;
      const bottom = points ? Math.max(...points.map((p) => p.y)) : order;
      return {
        text: d.text_prediction.text.trim(),
        x: points ? Math.min(...points.map((p) => p.x)) : 0,
        y: (top + bottom) / 2,
        height: bottom - top,
      };
    })
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: { y: number; height: number; words: typeof positioned }[] = [];
  for (const word of positioned) {
    const row = rows.find(
      (r) => Math.abs(r.y - word.y) <= Math.max(r.height, word.height) * 0.45,
    );
    if (row) row.words.push(word);
    else rows.push({ y: word.y, height: word.height, words: [word] });
  }
  const text = rows
    .map((row) =>
      row.words
        .sort((a, b) => a.x - b.x)
        .map((w) => w.text)
        .join(" "),
    )
    .join("\n")
    .slice(0, 100_000);
  const scores = detections.flatMap((d) =>
    d.text_prediction.confidence === undefined
      ? []
      : [d.text_prediction.confidence],
  );
  return {
    text,
    confidence: scores.length
      ? scores.reduce((sum, score) => sum + score, 0) / scores.length
      : null,
  };
}

export function readReceiptDate(value: string | null) {
  if (!value) return null;
  const clean = value.trim().replace(/(\d)(st|nd|rd|th)\b/gi, "$1");
  // Day-first numeric dates follow the app's Indian receipt locale. Review remains editable.
  for (const pattern of [
    "yyyy-MM-dd",
    "dd/MM/yyyy",
    "d/M/yyyy",
    "dd-MM-yyyy",
    "d-M-yyyy",
    "dd.MM.yyyy",
    "d MMM yyyy",
    "dd MMM yyyy",
    "d MMMM yyyy",
    "MMM d, yyyy",
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

export function extractBillFields(text: string): BillFields {
  const fields = emptyBillFields();
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const valueAfter = (labels: string, max = 160) => {
    const expression = new RegExp(
      `^(?:${labels})\\s*(?::|#|\\s-\\s|\\s)\\s*(.+)$`,
      "i",
    );
    for (const line of lines) {
      const match = line.match(expression);
      if (match?.[1]) {
        const value = match[1].trim();
        if (
          /^(?:qty|quantity)\b.*\b(?:total|amount|price|discount)\b/i.test(
            value,
          )
        )
          continue;
        return value.slice(0, max);
      }
    }
    return null;
  };
  fields.name =
    valueAfter(
      "item name|product name|bill name|product description|item description",
    ) ?? "";
  fields.retailer = valueAfter("retailer|store|seller|sold by|merchant");
  fields.brand = valueAfter("brand", 120);
  fields.invoiceNumber = valueAfter(
    "invoice (?:no\\.?|number)|bill (?:no\\.?|number)|receipt (?:no\\.?|number)",
  );
  fields.serialNumber = valueAfter("serial (?:no\\.?|number)|s/n|imei");
  fields.modelNumber = valueAfter("model (?:no\\.?|number)|model");
  fields.barcode = valueAfter("barcode|ean|upc|gtin");
  fields.purchaseDate = readReceiptDate(
    valueAfter(
      "purchase date|date of purchase|invoice date|bill date|receipt date|date",
    ),
  );
  const amount = valueAfter(
    "grand total|total amount(?: paid)?|amount paid|net payable|total payable|amount due|total",
  );
  if (amount) {
    const numeric = amount
      .replace(/(?:INR|USD|EUR|GBP|Rs\.?|₹|\$|€|£)/gi, "")
      .trim()
      .replace(/,/g, "");
    if (/^\d{1,10}(\.\d{1,2})?$/.test(numeric))
      fields.purchasePrice = Number(numeric).toFixed(2);
  }
  const currency = text
    .match(/\b(INR|USD|EUR|GBP|AUD|CAD|AED)\b/i)?.[1]
    ?.toUpperCase();
  if (currency) fields.currency = currency;
  else if (text.includes("€")) fields.currency = "EUR";
  else if (text.includes("£")) fields.currency = "GBP";
  const warranty = valueAfter("warranty(?: period| duration)?")?.match(
    /^(\d{1,3})\s*(months?|years?)\b/i,
  );
  if (warranty?.[1] && warranty[2]) {
    const months = Number(warranty[1]) * (/year/i.test(warranty[2]) ? 12 : 1);
    if (months <= 1200) fields.warrantyMonths = months;
  }
  const returnDays = valueAfter("return (?:window|period)")?.match(
    /^(\d{1,3})\s*days?\b/i,
  )?.[1];
  if (returnDays) fields.returnWindowDays = Number(returnDays);
  fields.warrantyExpiresAt =
    readReceiptDate(
      valueAfter("warranty expires|warranty end date|warranty expiry"),
    ) ??
    deadlineFromDuration(fields.purchaseDate, fields.warrantyMonths, "months");
  fields.returnExpiresAt =
    readReceiptDate(valueAfter("return by|return deadline")) ??
    deadlineFromDuration(fields.purchaseDate, fields.returnWindowDays, "days");
  return fields;
}
