-- Existing accounts must not receive a retrospective signup email.
ALTER TABLE "app_users" ADD COLUMN "welcome_status" text DEFAULT 'skipped' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_users" ALTER COLUMN "welcome_status" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN "welcome_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN "welcome_lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN "welcome_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN "welcome_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN "welcome_provider_id" text;--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN "welcome_error" text;--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN "welcome_payload" jsonb;
