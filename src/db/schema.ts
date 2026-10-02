import {
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const appUsers = pgTable("app_users", {
  id: text("id").primaryKey(),
  email: text("email"),
  uploadCount: integer("upload_count").default(0).notNull(),
  assistantCount: integer("assistant_count").default(0).notNull(),
  assistantWindowStartedAt: timestamp("assistant_window_started_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
  assistantLastRequestedAt: timestamp("assistant_last_requested_at", {
    withTimezone: true,
  }),
  uploadWindowStartedAt: timestamp("upload_window_started_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const items = pgTable(
  "items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    brand: text("brand"),
    retailer: text("retailer"),
    invoiceNumber: text("invoice_number"),
    modelNumber: text("model_number"),
    barcode: text("barcode"),
    category: text("category"),
    purchaseDate: date("purchase_date"),
    warrantyExpiresAt: date("warranty_expires_at"),
    warrantyMonths: integer("warranty_months"),
    returnWindowDays: integer("return_window_days"),
    returnExpiresAt: date("return_expires_at"),
    reminderDays: jsonb("reminder_days")
      .$type<number[]>()
      .default([])
      .notNull(),
    serialNumber: text("serial_number"),
    purchasePrice: numeric("purchase_price", { precision: 12, scale: 2 }),
    currency: text("currency").default("INR").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("items_user_id_id_unique").on(table.userId, table.id),
    index("items_user_expiry_idx").on(table.userId, table.warrantyExpiresAt),
    check(
      "items_purchase_price_nonnegative",
      sql`${table.purchasePrice} IS NULL OR ${table.purchasePrice} >= 0`,
    ),
    check("items_currency_length", sql`char_length(${table.currency}) = 3`),
    check(
      "items_warranty_months_valid",
      sql`${table.warrantyMonths} IS NULL OR ${table.warrantyMonths} BETWEEN 0 AND 1200`,
    ),
    check(
      "items_return_window_valid",
      sql`${table.returnWindowDays} IS NULL OR ${table.returnWindowDays} BETWEEN 0 AND 3650`,
    ),
  ],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    itemId: uuid("item_id"),
    originalFilename: text("original_filename").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: numeric("byte_size", { precision: 14, scale: 0 }).notNull(),
    sha256: text("sha256"),
    storageProvider: text("storage_provider"),
    storageKey: text("storage_key"),
    documentType: text("document_type").notNull(),
    ocrStatus: text("ocr_status").default("pending").notNull(),
    pageCount: integer("page_count").default(1).notNull(),
    ocrError: text("ocr_error"),
    extractedData: jsonb("extracted_data").$type<Record<
      string,
      unknown
    > | null>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("documents_user_created_idx").on(table.userId, table.createdAt),
    uniqueIndex("documents_user_id_id_unique").on(table.userId, table.id),
    foreignKey({
      columns: [table.userId, table.itemId],
      foreignColumns: [items.userId, items.id],
      name: "documents_user_item_fk",
    }).onDelete("cascade"),
    check("documents_byte_size_positive", sql`${table.byteSize} > 0`),
    check(
      "documents_page_count_valid",
      sql`${table.pageCount} BETWEEN 1 AND 10`,
    ),
    check(
      "documents_ocr_status_valid",
      sql`${table.ocrStatus} IN ('pending', 'processing', 'review', 'complete', 'failed')`,
    ),
  ],
);

export const documentPages = pgTable(
  "document_pages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    documentId: uuid("document_id").notNull(),
    pageIndex: integer("page_index").notNull(),
    text: text("text"),
    confidence: numeric("confidence", { precision: 5, scale: 4 }),
    status: text("status").default("processing").notNull(),
    attempts: integer("attempts").default(1).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("document_pages_document_page_unique").on(
      table.documentId,
      table.pageIndex,
    ),
    foreignKey({
      columns: [table.userId, table.documentId],
      foreignColumns: [documents.userId, documents.id],
      name: "document_pages_user_document_fk",
    }).onDelete("cascade"),
    check(
      "document_pages_index_valid",
      sql`${table.pageIndex} BETWEEN 0 AND 9`,
    ),
    check(
      "document_pages_status_valid",
      sql`${table.status} IN ('processing', 'complete', 'failed')`,
    ),
  ],
);

export const reminders = pgTable(
  "reminders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").notNull(),
    remindAt: timestamp("remind_at", { withTimezone: true }).notNull(),
    channel: text("channel").default("in_app").notNull(),
    deadlineType: text("deadline_type").default("warranty").notNull(),
    status: text("status").default("scheduled").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("reminders_user_item_time_unique").on(
      table.userId,
      table.itemId,
      table.deadlineType,
      table.remindAt,
    ),
    index("reminders_due_idx").on(table.status, table.remindAt),
    foreignKey({
      columns: [table.userId, table.itemId],
      foreignColumns: [items.userId, items.id],
      name: "reminders_user_item_fk",
    }).onDelete("cascade"),
    check(
      "reminders_status_valid",
      sql`${table.status} IN ('scheduled', 'sent', 'cancelled', 'failed')`,
    ),
    check(
      "reminders_channel_valid",
      sql`${table.channel} IN ('in_app', 'email', 'push')`,
    ),
  ],
);
