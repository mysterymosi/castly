ALTER TABLE "talent_profiles" ADD COLUMN "card_config" jsonb DEFAULT '{"leadMediaId":null,"highlightFacts":[]}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "talent_profiles" ADD COLUMN "quick_start_completed_at" timestamp with time zone;
