CREATE TABLE "media_moderation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"media_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "media_upload_tokens" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"media_id" uuid NOT NULL,
	"secret_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "media_moderation_jobs" ADD CONSTRAINT "media_moderation_jobs_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_upload_tokens" ADD CONSTRAINT "media_upload_tokens_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_moderation_jobs_media_id_uidx" ON "media_moderation_jobs" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "media_moderation_jobs_status_idx" ON "media_moderation_jobs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "media_upload_tokens_media_id_uidx" ON "media_upload_tokens" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "media_upload_tokens_expires_at_idx" ON "media_upload_tokens" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "media_upload_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "media_moderation_jobs" ENABLE ROW LEVEL SECURITY;