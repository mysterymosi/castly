ALTER TABLE "matches" ADD COLUMN "brief" jsonb;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "brief_attached_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_brief_attached_together" CHECK (("matches"."brief" IS NULL) = ("matches"."brief_attached_at" IS NULL)
        AND ("matches"."brief" IS NULL OR jsonb_typeof("matches"."brief") = 'object'));