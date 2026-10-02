ALTER TABLE "app_users" ADD COLUMN "assistant_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN "assistant_window_started_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN "assistant_last_requested_at" timestamp with time zone;