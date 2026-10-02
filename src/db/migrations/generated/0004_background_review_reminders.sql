CREATE TABLE "document_jobs" (
	"document_id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"generation" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"completed_pages" integer DEFAULT 0 NOT NULL,
	"error" text,
	"dispatched_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_jobs_status_valid" CHECK ("document_jobs"."status" IN ('queued', 'reading', 'extracting', 'complete', 'failed')),
	CONSTRAINT "document_jobs_generation_positive" CHECK ("document_jobs"."generation" > 0)
);
--> statement-breakpoint
DROP INDEX "reminders_user_item_time_unique";--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN "email_reminders" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN "timezone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN "reminder_hour" integer DEFAULT 9 NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "draft_fields" jsonb;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "draft_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "snoozed_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "delivery_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "delivery_token" uuid;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "delivery_lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "delivery_payload" jsonb;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "delivery_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "delivery_error" text;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "provider_message_id" text;--> statement-breakpoint
ALTER TABLE "document_jobs" ADD CONSTRAINT "document_jobs_user_document_fk" FOREIGN KEY ("user_id","document_id") REFERENCES "public"."documents"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_jobs_dispatch_idx" ON "document_jobs" USING btree ("status","dispatched_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reminders_user_item_time_unique" ON "reminders" USING btree ("user_id","item_id","deadline_type","remind_at","channel");