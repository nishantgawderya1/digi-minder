CREATE TABLE "app_users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"item_id" uuid,
	"original_filename" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" numeric(14, 0) NOT NULL,
	"sha256" text,
	"storage_provider" text,
	"storage_key" text,
	"document_type" text NOT NULL,
	"ocr_status" text DEFAULT 'pending' NOT NULL,
	"extracted_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_byte_size_positive" CHECK ("documents"."byte_size" > 0),
	CONSTRAINT "documents_ocr_status_valid" CHECK ("documents"."ocr_status" IN ('pending', 'processing', 'review', 'complete', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"category" text,
	"purchase_date" date,
	"warranty_expires_at" date,
	"serial_number" text,
	"purchase_price" numeric(12, 2),
	"currency" text DEFAULT 'INR' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_purchase_price_nonnegative" CHECK ("items"."purchase_price" IS NULL OR "items"."purchase_price" >= 0),
	CONSTRAINT "items_currency_length" CHECK (char_length("items"."currency") = 3)
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"item_id" uuid NOT NULL,
	"remind_at" timestamp with time zone NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminders_status_valid" CHECK ("reminders"."status" IN ('scheduled', 'sent', 'cancelled', 'failed')),
	CONSTRAINT "reminders_channel_valid" CHECK ("reminders"."channel" IN ('email', 'push'))
);
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_user_item_fk" FOREIGN KEY ("user_id","item_id") REFERENCES "public"."items"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_item_fk" FOREIGN KEY ("user_id","item_id") REFERENCES "public"."items"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_user_created_idx" ON "documents" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "items_user_id_id_unique" ON "items" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX "items_user_expiry_idx" ON "items" USING btree ("user_id","warranty_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reminders_user_item_time_unique" ON "reminders" USING btree ("user_id","item_id","remind_at");--> statement-breakpoint
CREATE INDEX "reminders_due_idx" ON "reminders" USING btree ("status","remind_at");