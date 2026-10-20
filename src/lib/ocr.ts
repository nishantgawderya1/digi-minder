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
  const positioned = parsed.data
    .flatMap((page, pageIndex) =>
      page.text_detections
        .filter((d) => d.text_prediction.text.trim())
        .map((d, order) => {
          const points = d.bounding_box?.points;
          const top = points ? Math.min(...points.map((p) => p.y)) : order;
          const bottom = points ? Math.max(...points.map((p) => p.y)) : order;
          return {
            text: d.text_prediction.text.trim(),
            page: pageIndex,
            x: points ? Math.min(...points.map((p) => p.x)) : 0,
            right: points ? Math.max(...points.map((p) => p.x)) : 0,
            y: (top + bottom) / 2,
            height: bottom - top,
          };
        }),
    )
    .sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
  const rows: {
    page: number;
    y: number;
    height: number;
    words: typeof positioned;
  }[] = [];
  for (const word of positioned) {
    const row = rows.find(
      (r) =>
        r.page === word.page &&
        Math.abs(r.y - word.y) <= Math.max(r.height, word.height) * 0.45,
    );
    if (row) row.words.push(word);
    else
      rows.push({
        page: word.page,
        y: word.y,
        height: word.height,
        words: [word],
      });
  }
  const text = rows
    .map((row, index) => {
      const words = row.words.sort((a, b) => a.x - b.x);
      const line = words
        .map((word, wordIndex) => {
          const previous = words[wordIndex - 1];
          if (!previous) return word.text;
          const characterWidth = Math.max(
            (previous.right - previous.x) / previous.text.length,
            (word.right - word.x) / word.text.length,
          );
          // Keep clear table columns distinct without splitting ordinary word gaps.
          const columnGap = Math.max(row.height, word.height) * 8;
          const separator =
            word.x - previous.right > Math.max(columnGap, characterWidth * 12)
              ? "\t"
              : " ";
          return separator + word.text;
        })
        .join("");
      return (
        (index > 0 && rows[index - 1]!.page !== row.page ? "\n" : "") + line
      );
    })
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

type ExtractedField =
  | "name"
  | "retailer"
  | "brand"
  | "invoiceNumber"
  | "serialNumber"
  | "modelNumber"
  | "barcode"
  | "purchaseDate"
  | "purchasePrice"
  | "warrantyMonths"
  | "returnWindowDays"
  | "warrantyExpiresAt"
  | "returnExpiresAt";
type LabelDefinition = {
  expression: string;
  field: ExtractedField | null;
  priority: number;
};
const labels: LabelDefinition[] = [
  {
    expression:
      "item name|product name|bill name|product description|item description",
    field: "name",
    priority: 1,
  },
  {
    expression: "retailer|store|seller|sold by|merchant",
    field: "retailer",
    priority: 1,
  },
  { expression: "brand(?: name)?", field: "brand", priority: 2 },
  {
    expression: "manufacturer(?: name)?|manufactured by",
    field: "brand",
    priority: 1,
  },
  {
    expression:
      "(?:tax )?invoice (?:no\\.?|number)|bill (?:no\\.?|number)|receipt (?:no\\.?|number)|bill of supply (?:no\\.?|number)",
    field: "invoiceNumber",
    priority: 1,
  },
  {
    expression: "serial (?:no\\.?|number)|s/n|imei(?: ?[12])?",
    field: "serialNumber",
    priority: 1,
  },
  {
    expression: "model (?:no\\.?|number)|model",
    field: "modelNumber",
    priority: 1,
  },
  { expression: "barcode|ean|upc|gtin", field: "barcode", priority: 1 },
  {
    expression: "purchase date|date of purchase",
    field: "purchaseDate",
    priority: 4,
  },
  {
    expression: "invoice date|bill date|receipt date",
    field: "purchaseDate",
    priority: 3,
  },
  { expression: "date", field: "purchaseDate", priority: 1 },
  {
    expression: "grand total|final total",
    field: "purchasePrice",
    priority: 5,
  },
  {
    expression: "total amount(?: paid)?|net payable|total payable",
    field: "purchasePrice",
    priority: 4,
  },
  { expression: "amount paid", field: "purchasePrice", priority: 3 },
  { expression: "amount due", field: "purchasePrice", priority: 2 },
  { expression: "total", field: "purchasePrice", priority: 1 },
  {
    expression: "warranty(?: period| duration)?",
    field: "warrantyMonths",
    priority: 1,
  },
  {
    expression: "return (?:window|period)",
    field: "returnWindowDays",
    priority: 1,
  },
  {
    expression: "warranty expires|warranty end date|warranty expiry",
    field: "warrantyExpiresAt",
    priority: 1,
  },
  {
    expression: "return by|return deadline",
    field: "returnExpiresAt",
    priority: 1,
  },
  // These labels delimit adjacent cells but must never become purchase facts.
  {
    expression:
      "(?:customer|buyer|recipient)(?: name)?|bill(?:ing)? to|ship(?:ping)? to|order (?:date|id|no\\.?|number)|date of order|due date|date due|payment date|delivery date|shipping date|manufactur(?:e|ed|ing) date|expiry date|subtotal|sub total|discount|qty|quantity|hsn|sac|unit price|rate|cgst|sgst|igst|cess|tax|payment method",
    field: null,
    priority: 0,
  },
];
const labelPatterns = labels.map((definition) => ({
  definition,
  pattern: new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${definition.expression})(?=$|[\\s:#])`,
    "giu",
  ),
}));

function lineLabels(line: string) {
  const all = labelPatterns
    .flatMap(({ definition, pattern }) =>
      [...line.matchAll(pattern)].map((match) => ({ match, definition })),
    )
    .sort(
      (a, b) =>
        a.match.index - b.match.index || b.match[0].length - a.match[0].length,
    );
  let previousEnd = 0;
  return all.flatMap(({ match, definition }) => {
    const start = match.index;
    const label = match[0];
    if (start < previousEnd) return [];
    // Consume the complete role label so "Order date" cannot become "Date".
    previousEnd = start + label.length;
    const remainder = line.slice(start + label.length);
    const separator = remainder.match(/^(?:\s*[:#]\s*|\s+-\s+|\s+|$)/)?.[0];
    if (separator === undefined) return [];
    const explicit = /[:#]|\s-\s/.test(separator);
    // Mid-value words such as "Model Home" are not additional field labels.
    const cellStart =
      start === 0 || /(?:\t|[|;]| {2,})\s*$/.test(line.slice(0, start));
    if (!explicit && !cellStart) return [];
    return [
      {
        start,
        end: start + label.length + separator.length,
        explicit,
        definition,
      },
    ];
  });
}

function labeledValues(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  return lines.flatMap((line, lineIndex) => {
    const matches = lineLabels(line);
    return matches.flatMap((match, index) => {
      if (!match.definition.field) return [];
      let value = line
        .slice(match.end, matches[index + 1]?.start)
        .replace(/[\s|;]+$/, "")
        .trim();
      const next = lines[lineIndex + 1];
      if (
        !value &&
        matches.length === 1 &&
        match.explicit &&
        next &&
        !lineLabels(next).length
      )
        value = next;
      if (
        /^(?:qty|quantity|hsn|sac)\b.*\b(?:total|amount|price|discount|tax)\b/i.test(
          value,
        )
      )
        return [];
      return [
        {
          field: match.definition.field,
          priority: match.definition.priority,
          value,
        },
      ];
    });
  });
}

export function extractBillFields(text: string): BillFields {
  const fields = emptyBillFields();
  const candidates = labeledValues(text);
  const invoiceIds = new Set(
    candidates
      .filter((candidate) => candidate.field === "invoiceNumber")
      .map((candidate) => candidate.value.trim().toUpperCase())
      .filter(Boolean),
  );
  // Pages containing different invoices need an explicit invoice selection.
  if (invoiceIds.size > 1) return fields;
  const valueFor = <T>(
    field: ExtractedField,
    parseValue: (value: string) => T | null,
  ): T | null => {
    const matches = candidates.filter((candidate) => candidate.field === field);
    if (!matches.length) return null;
    const priority = Math.max(
      ...matches.map((candidate) => candidate.priority),
    );
    const values = matches
      .filter((candidate) => candidate.priority === priority)
      .map((candidate) => parseValue(candidate.value));
    // Repeated headers and conflicting items are not a safe basis for a single bill field.
    if (values.some((value) => value === null)) return null;
    const distinct = [...new Set(values)];
    return distinct.length === 1 ? distinct[0]! : null;
  };
  const literal =
    (max = 160) =>
    (value: string) =>
      value.length > 0 && value.length <= max ? value : null;
  fields.name = valueFor("name", literal()) ?? "";
  fields.retailer = valueFor("retailer", literal());
  fields.brand = valueFor("brand", literal(120));
  fields.invoiceNumber = valueFor("invoiceNumber", literal());
  fields.serialNumber = valueFor("serialNumber", literal());
  fields.modelNumber = valueFor("modelNumber", literal());
  fields.barcode = valueFor("barcode", literal());
  fields.purchaseDate = valueFor("purchaseDate", readReceiptDate);
  fields.purchasePrice = valueFor("purchasePrice", (amount) => {
    const numeric = amount
      .replace(/(?:INR|USD|EUR|GBP|Rs\.?|₹|\$|€|£)/gi, "")
      .trim()
      .replace(/,/g, "");
    return /^\d{1,10}(\.\d{1,2})?$/.test(numeric)
      ? Number(numeric).toFixed(2)
      : null;
  });
  const currency = text
    .match(/\b(INR|USD|EUR|GBP|AUD|CAD|AED)\b/i)?.[1]
    ?.toUpperCase();
  if (currency) fields.currency = currency;
  else if (text.includes("€")) fields.currency = "EUR";
  else if (text.includes("£")) fields.currency = "GBP";
  fields.warrantyMonths = valueFor("warrantyMonths", (value) => {
    const warranty = value.match(/^(\d{1,3})\s*(months?|years?)\b/i);
    if (!warranty?.[1] || !warranty[2]) return null;
    const months = Number(warranty[1]) * (/year/i.test(warranty[2]) ? 12 : 1);
    return months <= 1200 ? months : null;
  });
  fields.returnWindowDays = valueFor("returnWindowDays", (value) => {
    const days = value.match(/^(\d{1,3})\s*days?\b/i)?.[1];
    return days === undefined ? null : Number(days);
  });
  fields.warrantyExpiresAt =
    valueFor("warrantyExpiresAt", readReceiptDate) ??
    deadlineFromDuration(fields.purchaseDate, fields.warrantyMonths, "months");
  fields.returnExpiresAt =
    valueFor("returnExpiresAt", readReceiptDate) ??
    deadlineFromDuration(fields.purchaseDate, fields.returnWindowDays, "days");
  return fields;
}
