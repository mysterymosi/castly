CREATE TYPE "public"."language_fluency" AS ENUM('basic', 'conversational', 'fluent', 'native');--> statement-breakpoint
CREATE TYPE "public"."media_asset_status" AS ENUM('pending', 'processing', 'ready', 'failed', 'quarantined');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('image', 'video', 'audio', 'document');--> statement-breakpoint
CREATE TYPE "public"."media_provider" AS ENUM('cf_images', 'cf_stream', 'supabase');--> statement-breakpoint
CREATE TYPE "public"."rate_visibility" AS ENUM('public', 'verified_bookers', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."skill_proficiency" AS ENUM('learning', 'competent', 'proficient', 'expert');--> statement-breakpoint
CREATE TYPE "public"."talent_availability_status" AS ENUM('available', 'partial', 'booked');--> statement-breakpoint
CREATE TYPE "public"."talent_profile_status" AS ENUM('draft', 'live', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."talent_rate_kind" AS ENUM('day', 'half_day', 'project');--> statement-breakpoint
CREATE TABLE "affiliations" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"talent_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role_title" text,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credits" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"talent_id" uuid NOT NULL,
	"title" text NOT NULL,
	"role_name" text,
	"production_company" text,
	"year" integer,
	"type" text,
	"link" text,
	"is_signature" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" "media_kind" NOT NULL,
	"provider" "media_provider" NOT NULL,
	"provider_ref" text,
	"status" "media_asset_status" DEFAULT 'pending' NOT NULL,
	"width" integer,
	"height" integer,
	"duration_ms" integer,
	"poster_url" text,
	"blurhash" text,
	"moderation_status" text,
	"moderation_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_sections" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"talent_id" uuid NOT NULL,
	"type" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "press" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"talent_id" uuid NOT NULL,
	"outlet" text NOT NULL,
	"headline" text,
	"url" text,
	"published_at" timestamp with time zone,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_delegates" (
	"talent_id" uuid NOT NULL,
	"delegate_user_id" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "profile_delegates_talent_id_delegate_user_id_pk" PRIMARY KEY("talent_id","delegate_user_id"),
	CONSTRAINT "profile_delegates_not_self" CHECK ("profile_delegates"."delegate_user_id" <> "profile_delegates"."talent_id")
);
--> statement-breakpoint
CREATE TABLE "section_media" (
	"section_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"caption" text,
	CONSTRAINT "section_media_section_id_media_id_pk" PRIMARY KEY("section_id","media_id")
);
--> statement-breakpoint
CREATE TABLE "social_links" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"talent_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"url" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "talent_accents" (
	"talent_id" uuid NOT NULL,
	"accent_id" uuid NOT NULL,
	CONSTRAINT "talent_accents_talent_id_accent_id_pk" PRIMARY KEY("talent_id","accent_id")
);
--> statement-breakpoint
CREATE TABLE "talent_attributes" (
	"talent_id" uuid NOT NULL,
	"definition_id" uuid NOT NULL,
	"value_text" text,
	"value_num" numeric,
	"value_bool" boolean,
	"is_visible" boolean DEFAULT true NOT NULL,
	CONSTRAINT "talent_attributes_talent_id_definition_id_pk" PRIMARY KEY("talent_id","definition_id")
);
--> statement-breakpoint
CREATE TABLE "talent_availability" (
	"talent_id" uuid NOT NULL,
	"month" text NOT NULL,
	"status" "talent_availability_status" DEFAULT 'available' NOT NULL,
	CONSTRAINT "talent_availability_talent_id_month_pk" PRIMARY KEY("talent_id","month")
);
--> statement-breakpoint
CREATE TABLE "talent_categories" (
	"talent_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "talent_categories_talent_id_category_id_pk" PRIMARY KEY("talent_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "talent_languages" (
	"talent_id" uuid NOT NULL,
	"language_id" uuid NOT NULL,
	"fluency" "language_fluency" DEFAULT 'conversational' NOT NULL,
	CONSTRAINT "talent_languages_talent_id_language_id_pk" PRIMARY KEY("talent_id","language_id")
);
--> statement-breakpoint
CREATE TABLE "talent_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"headline" text,
	"bio" text,
	"city_id" uuid,
	"willing_to_travel" boolean DEFAULT false NOT NULL,
	"open_to_relocate" boolean DEFAULT false NOT NULL,
	"status" "talent_profile_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"completeness_score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"quality_score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"responsiveness_score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"rate_visibility" "rate_visibility" DEFAULT 'public' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "talent_rates" (
	"talent_id" uuid NOT NULL,
	"kind" "talent_rate_kind" NOT NULL,
	"amount_min" numeric(12, 2),
	"amount_max" numeric(12, 2),
	"currency" text DEFAULT 'NGN' NOT NULL,
	"negotiable" boolean DEFAULT true NOT NULL,
	CONSTRAINT "talent_rates_talent_id_kind_pk" PRIMARY KEY("talent_id","kind")
);
--> statement-breakpoint
CREATE TABLE "talent_skills" (
	"talent_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"proficiency" "skill_proficiency" DEFAULT 'competent' NOT NULL,
	CONSTRAINT "talent_skills_talent_id_skill_id_pk" PRIMARY KEY("talent_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "testimonials" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"talent_id" uuid NOT NULL,
	"author_name" text NOT NULL,
	"author_title" text,
	"body" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"talent_id" uuid NOT NULL,
	"institution" text NOT NULL,
	"program" text,
	"year" integer,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "affiliations" ADD CONSTRAINT "affiliations_talent_id_talent_profiles_user_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credits" ADD CONSTRAINT "credits_talent_id_talent_profiles_user_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_sections" ADD CONSTRAINT "portfolio_sections_talent_id_talent_profiles_user_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "press" ADD CONSTRAINT "press_talent_id_talent_profiles_user_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_delegates" ADD CONSTRAINT "profile_delegates_talent_id_talent_profiles_user_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_delegates" ADD CONSTRAINT "profile_delegates_delegate_user_id_users_id_fk" FOREIGN KEY ("delegate_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_media" ADD CONSTRAINT "section_media_section_id_portfolio_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."portfolio_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_media" ADD CONSTRAINT "section_media_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_links" ADD CONSTRAINT "social_links_talent_id_talent_profiles_user_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_accents" ADD CONSTRAINT "talent_accents_talent_id_talent_profiles_user_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_accents" ADD CONSTRAINT "talent_accents_accent_id_accents_id_fk" FOREIGN KEY ("accent_id") REFERENCES "public"."accents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_attributes" ADD CONSTRAINT "talent_attributes_talent_id_talent_profiles_user_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_attributes" ADD CONSTRAINT "talent_attributes_definition_id_attribute_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."attribute_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_availability" ADD CONSTRAINT "talent_availability_talent_id_talent_profiles_user_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_categories" ADD CONSTRAINT "talent_categories_talent_id_talent_profiles_user_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_categories" ADD CONSTRAINT "talent_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_languages" ADD CONSTRAINT "talent_languages_talent_id_talent_profiles_user_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_languages" ADD CONSTRAINT "talent_languages_language_id_languages_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_profiles" ADD CONSTRAINT "talent_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_profiles" ADD CONSTRAINT "talent_profiles_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_rates" ADD CONSTRAINT "talent_rates_talent_id_talent_profiles_user_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_skills" ADD CONSTRAINT "talent_skills_talent_id_talent_profiles_user_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_skills" ADD CONSTRAINT "talent_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_talent_id_talent_profiles_user_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training" ADD CONSTRAINT "training_talent_id_talent_profiles_user_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "affiliations_talent_id_idx" ON "affiliations" USING btree ("talent_id");--> statement-breakpoint
CREATE INDEX "credits_talent_id_idx" ON "credits" USING btree ("talent_id");--> statement-breakpoint
CREATE INDEX "media_assets_owner_id_idx" ON "media_assets" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "portfolio_sections_talent_id_idx" ON "portfolio_sections" USING btree ("talent_id");--> statement-breakpoint
CREATE INDEX "portfolio_sections_talent_position_idx" ON "portfolio_sections" USING btree ("talent_id","position");--> statement-breakpoint
CREATE INDEX "press_talent_id_idx" ON "press" USING btree ("talent_id");--> statement-breakpoint
CREATE INDEX "profile_delegates_delegate_user_id_idx" ON "profile_delegates" USING btree ("delegate_user_id");--> statement-breakpoint
CREATE INDEX "section_media_media_id_idx" ON "section_media" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "social_links_talent_id_idx" ON "social_links" USING btree ("talent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_links_talent_platform_uidx" ON "social_links" USING btree ("talent_id","platform");--> statement-breakpoint
CREATE INDEX "talent_accents_accent_id_idx" ON "talent_accents" USING btree ("accent_id");--> statement-breakpoint
CREATE INDEX "talent_attributes_definition_id_idx" ON "talent_attributes" USING btree ("definition_id");--> statement-breakpoint
CREATE INDEX "talent_categories_category_id_idx" ON "talent_categories" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "talent_languages_language_id_idx" ON "talent_languages" USING btree ("language_id");--> statement-breakpoint
CREATE UNIQUE INDEX "talent_profiles_slug_uidx" ON "talent_profiles" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "talent_skills_skill_id_idx" ON "talent_skills" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "testimonials_talent_id_idx" ON "testimonials" USING btree ("talent_id");--> statement-breakpoint
CREATE INDEX "training_talent_id_idx" ON "training" USING btree ("talent_id");--> statement-breakpoint
ALTER TABLE "talent_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "talent_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "talent_attributes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "talent_skills" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "talent_languages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "talent_accents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "credits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "talent_rates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "talent_availability" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "training" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "affiliations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "press" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "testimonials" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "social_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "portfolio_sections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "section_media" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "media_assets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "profile_delegates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.enforce_portfolio_section_cap()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  visible_count integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF NOT NEW.is_visible THEN
    RETURN NEW;
  END IF;

  SELECT count(*)::int
  INTO visible_count
  FROM public.portfolio_sections ps
  WHERE ps.talent_id = NEW.talent_id
    AND ps.is_visible = true
    AND ps.id IS DISTINCT FROM NEW.id;

  IF visible_count >= 12 THEN
    RAISE EXCEPTION 'portfolio_sections_visible_cap_exceeded'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$fn$;--> statement-breakpoint
CREATE TRIGGER portfolio_sections_visible_cap
  BEFORE INSERT OR UPDATE OF is_visible, talent_id ON public.portfolio_sections
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_portfolio_section_cap();--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.talent_profile_owner_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'talent_profile_owner_immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;--> statement-breakpoint
CREATE TRIGGER talent_profiles_owner_immutable
  BEFORE UPDATE OF user_id ON public.talent_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.talent_profile_owner_immutable();