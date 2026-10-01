import {
  check,
  date,
  foreignKey,
  index,
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
    category: text("category"),
    purchaseDate: date("purchase_date"),
    warrantyExpiresAt: date("warranty_expires_at"),
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
    foreignKey({
      columns: [table.userId, table.itemId],
      foreignColumns: [items.userId, items.id],
      name: "documents_user_item_fk",
    }).onDelete("cascade"),
    check("documents_byte_size_positive", sql`${table.byteSize} > 0`),
    check(
      "documents_ocr_status_valid",
      sql`${table.ocrStatus} IN ('pending', 'processing', 'review', 'complete', 'failed')`,
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
    channel: text("channel").default("email").notNull(),
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
      sql`${table.channel} IN ('email', 'push')`,
    ),
  ],
);
