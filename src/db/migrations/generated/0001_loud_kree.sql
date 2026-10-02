CREATE TABLE "document_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"document_id" uuid NOT NULL,
	"page_index" integer NOT NULL,
	"text" text,
	"confidence" numeric(5, 4),
	"status" text DEFAULT 'processing' NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_pages_index_valid" CHECK ("document_pages"."page_index" BETWEEN 0 AND 9),
	CONSTRAINT "document_pages_status_valid" CHECK ("document_pages"."status" IN ('processing', 'complete', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "reminders" DROP CONSTRAINT "reminders_channel_valid";--> statement-breakpoint
DROP INDEX "reminders_user_item_time_unique";--> statement-breakpoint
ALTER TABLE "reminders" ALTER COLUMN "channel" SET DEFAULT 'in_app';--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "page_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "ocr_error" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "retailer" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "invoice_number" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "model_number" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "barcode" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "warranty_months" integer;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "return_window_days" integer;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "return_expires_at" date;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "reminder_days" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "deadline_type" text DEFAULT 'warranty' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "documents_user_id_id_unique" ON "documents" USING btree ("user_id","id");--> statement-breakpoint
ALTER TABLE "document_pages" ADD CONSTRAINT "document_pages_user_document_fk" FOREIGN KEY ("user_id","document_id") REFERENCES "public"."documents"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_pages_document_page_unique" ON "document_pages" USING btree ("document_id","page_index");--> statement-breakpoint
CREATE UNIQUE INDEX "reminders_user_item_time_unique" ON "reminders" USING btree ("user_id","item_id","deadline_type","remind_at");--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_warranty_months_valid" CHECK ("items"."warranty_months" IS NULL OR "items"."warranty_months" BETWEEN 0 AND 1200);--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_return_window_valid" CHECK ("items"."return_window_days" IS NULL OR "items"."return_window_days" BETWEEN 0 AND 3650);--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_channel_valid" CHECK ("reminders"."channel" IN ('in_app', 'email', 'push'));
