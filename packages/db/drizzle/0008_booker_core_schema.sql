CREATE TYPE "public"."booker_vertical" AS ENUM('casting_director', 'producer', 'director', 'brand_or_agency', 'event_planner', 'photographer', 'content_creator', 'other');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."project_type" AS ENUM('film', 'tv', 'commercial', 'music_video', 'theatre', 'campaign', 'event', 'photoshoot', 'content', 'other');--> statement-breakpoint
CREATE TYPE "public"."verification_tier" AS ENUM('phone', 'id', 'professional');--> statement-breakpoint
CREATE TABLE "booker_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"vertical" "booker_vertical" NOT NULL,
	"company_name" text,
	"cac_number" text,
	"city_id" uuid,
	"typical_project_types" "project_type"[] DEFAULT '{}'::project_type[] NOT NULL,
	"verification_tier" "verification_tier" DEFAULT 'phone' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"booker_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "project_type",
	"status" "project_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_name_not_blank" CHECK (btrim("projects"."name") <> '')
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"brief" text,
	"category_id" uuid,
	"requirements" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"shoot_starts_on" date,
	"shoot_ends_on" date,
	"rate_min" numeric(12, 2),
	"rate_max" numeric(12, 2),
	"rate_currency" text DEFAULT 'NGN' NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_not_blank" CHECK (btrim("roles"."name") <> ''),
	CONSTRAINT "roles_brief_not_blank" CHECK ("roles"."brief" IS NULL OR btrim("roles"."brief") <> ''),
	CONSTRAINT "roles_requirements_object" CHECK (jsonb_typeof("roles"."requirements") = 'object'),
	CONSTRAINT "roles_shoot_window_order" CHECK ("roles"."shoot_starts_on" IS NULL OR "roles"."shoot_ends_on" IS NULL OR "roles"."shoot_ends_on" >= "roles"."shoot_starts_on"),
	CONSTRAINT "roles_rate_range" CHECK (("roles"."rate_min" IS NULL OR "roles"."rate_min" >= 0)
        AND ("roles"."rate_max" IS NULL OR "roles"."rate_max" >= 0)
        AND ("roles"."rate_min" IS NULL OR "roles"."rate_max" IS NULL OR "roles"."rate_max" >= "roles"."rate_min")),
	CONSTRAINT "roles_published_at_matches" CHECK ("roles"."is_published" = ("roles"."published_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "shortlist_entries" (
	"shortlist_id" uuid NOT NULL,
	"talent_id" uuid NOT NULL,
	"note" text,
	"rank" integer,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shortlist_entries_shortlist_id_talent_id_pk" PRIMARY KEY("shortlist_id","talent_id")
);
--> statement-breakpoint
CREATE TABLE "shortlists" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"booker_id" uuid NOT NULL,
	"role_id" uuid,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shortlists_booker_role_key" UNIQUE NULLS NOT DISTINCT("booker_id","role_id"),
	CONSTRAINT "shortlists_name_not_blank" CHECK (btrim("shortlists"."name") <> '')
);
--> statement-breakpoint
ALTER TABLE "booker_profiles" ADD CONSTRAINT "booker_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booker_profiles" ADD CONSTRAINT "booker_profiles_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_booker_id_booker_profiles_user_id_fk" FOREIGN KEY ("booker_id") REFERENCES "public"."booker_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlist_entries" ADD CONSTRAINT "shortlist_entries_shortlist_id_shortlists_id_fk" FOREIGN KEY ("shortlist_id") REFERENCES "public"."shortlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlist_entries" ADD CONSTRAINT "shortlist_entries_talent_id_talent_profiles_user_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_booker_id_booker_profiles_user_id_fk" FOREIGN KEY ("booker_id") REFERENCES "public"."booker_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booker_profiles_city_id_idx" ON "booker_profiles" USING btree ("city_id");--> statement-breakpoint
CREATE INDEX "projects_booker_status_created_idx" ON "projects" USING btree ("booker_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "roles_project_id_idx" ON "roles" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "roles_category_id_idx" ON "roles" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "shortlist_entries_talent_id_idx" ON "shortlist_entries" USING btree ("talent_id");--> statement-breakpoint
CREATE INDEX "shortlists_role_id_idx" ON "shortlists" USING btree ("role_id");--> statement-breakpoint
-- Default-deny (0000/0001): RLS on, no policies. anon/authenticated keep SELECT through default
-- privileges and get zero rows; castly_api bypasses RLS.
ALTER TABLE "booker_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "shortlists" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "shortlist_entries" ENABLE ROW LEVEL SECURITY;
