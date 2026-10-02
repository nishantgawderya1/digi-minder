import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  format,
  isValid,
  parseISO,
} from "date-fns";
import { z } from "zod";
import type { items } from "@/db/schema";

export const categories = [
  "Electronics",
  "Appliances",
  "Furniture",
  "Clothing",
  "Other",
] as const;
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_PAGES = 10;
export const acceptedFileTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

const optionalText = (max: number) => z.string().trim().max(max).nullable();
const optionalDate = z.string().date().nullable();
export const billFieldsSchema = z
  .object({
    name: z.string().trim().max(160),
    retailer: optionalText(160),
    brand: optionalText(120),
    invoiceNumber: optionalText(160),
    serialNumber: optionalText(160),
    modelNumber: optionalText(160),
    barcode: optionalText(160),
    category: z.enum(categories).nullable(),
    purchasePrice: z
      .string()
      .regex(/^\d{1,10}(\.\d{1,2})?$/, "Enter a valid non-negative amount.")
      .nullable(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .refine((value) => {
        try {
          new Intl.NumberFormat("en", { style: "currency", currency: value });
          return true;
        } catch {
          return false;
        }
      }, "Use a three-letter currency code."),
    purchaseDate: optionalDate,
    warrantyMonths: z.number().int().min(0).max(1200).nullable(),
    warrantyExpiresAt: optionalDate,
    returnWindowDays: z.number().int().min(0).max(3650).nullable(),
    returnExpiresAt: optionalDate,
    notes: optionalText(4000),
    reminderDays: z.array(z.number().int().min(0).max(365)).max(10),
  })
  .strict();
export type BillFields = z.infer<typeof billFieldsSchema>;
export type Bill = typeof items.$inferSelect;
export const emptyBillFields = (): BillFields => ({
  name: "",
  retailer: null,
  brand: null,
  invoiceNumber: null,
  serialNumber: null,
  modelNumber: null,
  barcode: null,
  category: null,
  purchasePrice: null,
  currency: "INR",
  purchaseDate: null,
  warrantyMonths: null,
  warrantyExpiresAt: null,
  returnWindowDays: null,
  returnExpiresAt: null,
  notes: null,
  reminderDays: [30, 7, 1],
});

export const saveBillSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid().nullable(),
  fields: billFieldsSchema
    .refine((fields) => fields.name.length > 0, {
      message: "Enter a bill or item name.",
      path: ["name"],
    })
    .refine(
      (fields) =>
        !fields.purchaseDate ||
        !fields.warrantyExpiresAt ||
        fields.warrantyExpiresAt >= fields.purchaseDate,
      {
        message: "Warranty end cannot be before purchase.",
        path: ["warrantyExpiresAt"],
      },
    )
    .refine(
      (fields) =>
        !fields.purchaseDate ||
        !fields.returnExpiresAt ||
        fields.returnExpiresAt >= fields.purchaseDate,
      {
        message: "Return deadline cannot be before purchase.",
        path: ["returnExpiresAt"],
      },
    ),
});

export function deadlineFromDuration(
  purchaseDate: string | null,
  duration: number | null,
  unit: "months" | "days",
) {
  if (!purchaseDate || duration === null || !isValid(parseISO(purchaseDate)))
    return null;
  return format(
    unit === "months"
      ? addMonths(parseISO(purchaseDate), duration)
      : addDays(parseISO(purchaseDate), duration),
    "yyyy-MM-dd",
  );
}

export function warrantyState(
  item: Pick<Bill, "purchaseDate" | "warrantyExpiresAt">,
  today = new Date(),
) {
  if (!item.warrantyExpiresAt)
    return {
      status: "unknown" as const,
      label: "No cover date",
      daysLeft: null,
      percent: 0,
    };
  const end = parseISO(item.warrantyExpiresAt);
  const daysLeft = differenceInCalendarDays(end, today);
  const total = item.purchaseDate
    ? differenceInCalendarDays(end, parseISO(item.purchaseDate))
    : 0;
  const status: "expired" | "ending" | "active" =
    daysLeft < 0 ? "expired" : daysLeft <= 30 ? "ending" : "active";
  return {
    status,
    daysLeft,
    label:
      daysLeft < 0
        ? "Cover ended"
        : daysLeft === 0
          ? "Ends today"
          : `${daysLeft} days left`,
    percent:
      total > 0 ? Math.max(0, Math.min(100, (daysLeft / total) * 100)) : 0,
  };
}

export function money(amount: string | null, currency = "INR") {
  return amount === null
    ? "Amount not recorded"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(Number(amount));
}
export function displayDate(value: string | null) {
  return value ? format(parseISO(value), "d MMM yyyy") : "Not recorded";
}
export function totalsByCurrency(
  records: Pick<Bill, "purchasePrice" | "currency">[],
) {
  const totals = new Map<string, number>();
  for (const record of records) {
    if (record.purchasePrice !== null)
      totals.set(
        record.currency,
        (totals.get(record.currency) ?? 0) +
          Math.round(Number(record.purchasePrice) * 100),
      );
  }
  return [...totals].map(([currency, cents]) =>
    money((cents / 100).toFixed(2), currency),
  );
}

export function reminderSchedule(fields: BillFields, today = new Date()) {
  const result: { deadlineType: "warranty" | "return"; remindAt: Date }[] = [];
  for (const [deadlineType, date] of [
    ["warranty", fields.warrantyExpiresAt],
    ["return", fields.returnExpiresAt],
  ] as const) {
    if (!date) continue;
    for (const days of new Set(fields.reminderDays)) {
      const remindAt = new Date(
        `${format(addDays(parseISO(date), -days), "yyyy-MM-dd")}T09:00:00.000Z`,
      );
      if (remindAt > today) result.push({ deadlineType, remindAt });
    }
  }
  return result;
}
