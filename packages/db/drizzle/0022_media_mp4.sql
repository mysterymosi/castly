CREATE TYPE "public"."media_mp4_status" AS ENUM('preparing', 'ready', 'skipped', 'errored');--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "mp4_status" "media_mp4_status";--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "mp4_name" text;--> statement-breakpoint
CREATE INDEX "media_assets_mp4_preparing_idx" ON "media_assets" USING btree ("created_at") WHERE "media_assets"."mp4_status" = 'preparing';--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_mp4_name_when_ready" CHECK (("media_assets"."mp4_status" IS NOT DISTINCT FROM 'ready') = ("media_assets"."mp4_name" IS NOT NULL));