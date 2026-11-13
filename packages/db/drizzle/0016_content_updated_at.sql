ALTER TABLE "talent_profiles" ADD COLUMN "content_updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- Best record of the last edit so far: updated_at (inflated by studio visits, which stop moving it now).
UPDATE "talent_profiles" SET "content_updated_at" = "updated_at";
