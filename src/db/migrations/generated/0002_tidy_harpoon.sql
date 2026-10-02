ALTER TABLE "app_users" ADD COLUMN "upload_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN "upload_window_started_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_page_count_valid" CHECK ("documents"."page_count" BETWEEN 1 AND 10);