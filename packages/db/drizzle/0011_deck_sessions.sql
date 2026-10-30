CREATE TYPE "public"."swipe_direction" AS ENUM('pass', 'interest', 'save');--> statement-breakpoint
CREATE TYPE "public"."swipe_source" AS ENUM('deck', 'open_role', 'search');--> statement-breakpoint
CREATE TABLE "deck_impressions" (
	"session_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"talent_id" uuid NOT NULL,
	"shown_at" timestamp with time zone DEFAULT now() NOT NULL,
	"max_scroll_depth" numeric(4, 3),
	"dwell_ms" integer,
	CONSTRAINT "deck_impressions_session_id_position_pk" PRIMARY KEY("session_id","position"),
	CONSTRAINT "deck_impressions_scroll_depth_range" CHECK ("deck_impressions"."max_scroll_depth" IS NULL OR ("deck_impressions"."max_scroll_depth" >= 0 AND "deck_impressions"."max_scroll_depth" <= 1)),
	CONSTRAINT "deck_impressions_dwell_nonnegative" CHECK ("deck_impressions"."dwell_ms" IS NULL OR "deck_impressions"."dwell_ms" >= 0)
);
--> statement-breakpoint
CREATE TABLE "deck_queue" (
	"session_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"talent_id" uuid NOT NULL,
	"score" numeric(10, 4) NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"served_at" timestamp with time zone,
	CONSTRAINT "deck_queue_session_id_position_pk" PRIMARY KEY("session_id","position"),
	CONSTRAINT "deck_queue_session_talent_key" UNIQUE("session_id","talent_id"),
	CONSTRAINT "deck_queue_position_nonnegative" CHECK ("deck_queue"."position" >= 0),
	CONSTRAINT "deck_queue_reasons_array" CHECK (jsonb_typeof("deck_queue"."reasons") = 'array')
);
--> statement-breakpoint
CREATE TABLE "deck_sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"booker_id" uuid NOT NULL,
	"role_id" uuid,
	"goal_count" integer,
	"seed" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "deck_sessions_goal_count_positive" CHECK ("deck_sessions"."goal_count" IS NULL OR "deck_sessions"."goal_count" > 0),
	CONSTRAINT "deck_sessions_ended_after_start" CHECK ("deck_sessions"."ended_at" IS NULL OR "deck_sessions"."ended_at" >= "deck_sessions"."started_at")
);
--> statement-breakpoint
CREATE TABLE "profile_views" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"talent_id" uuid NOT NULL,
	"viewer_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "swipes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"booker_id" uuid NOT NULL,
	"talent_id" uuid NOT NULL,
	"role_id" uuid,
	"direction" "swipe_direction" NOT NULL,
	"source" "swipe_source" DEFAULT 'deck' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"undone_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "talent_exposure_daily" (
	"talent_id" uuid NOT NULL,
	"day" date NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"interests" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "talent_exposure_daily_talent_id_day_pk" PRIMARY KEY("talent_id","day"),
	CONSTRAINT "talent_exposure_daily_counts_nonnegative" CHECK ("talent_exposure_daily"."impressions" >= 0 AND "talent_exposure_daily"."interests" >= 0)
);
--> statement-breakpoint
ALTER TABLE "deck_impressions" ADD CONSTRAINT "deck_impressions_session_id_deck_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."deck_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_impressions" ADD CONSTRAINT "deck_impressions_talent_id_talent_profiles_user_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_queue" ADD CONSTRAINT "deck_queue_session_id_deck_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."deck_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_queue" ADD CONSTRAINT "deck_queue_talent_id_talent_profiles_user_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_sessions" ADD CONSTRAINT "deck_sessions_booker_id_booker_profiles_user_id_fk" FOREIGN KEY ("booker_id") REFERENCES "public"."booker_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_sessions" ADD CONSTRAINT "deck_sessions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_views" ADD CONSTRAINT "profile_views_talent_id_talent_profiles_user_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_views" ADD CONSTRAINT "profile_views_viewer_id_users_id_fk" FOREIGN KEY ("viewer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swipes" ADD CONSTRAINT "swipes_booker_id_booker_profiles_user_id_fk" FOREIGN KEY ("booker_id") REFERENCES "public"."booker_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swipes" ADD CONSTRAINT "swipes_talent_id_talent_profiles_user_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swipes" ADD CONSTRAINT "swipes_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_exposure_daily" ADD CONSTRAINT "talent_exposure_daily_talent_id_talent_profiles_user_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deck_impressions_talent_shown_idx" ON "deck_impressions" USING btree ("talent_id","shown_at");--> statement-breakpoint
CREATE INDEX "deck_queue_talent_id_idx" ON "deck_queue" USING btree ("talent_id");--> statement-breakpoint
CREATE INDEX "deck_sessions_booker_started_idx" ON "deck_sessions" USING btree ("booker_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "deck_sessions_role_id_idx" ON "deck_sessions" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "profile_views_talent_at_idx" ON "profile_views" USING btree ("talent_id","at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "profile_views_viewer_id_idx" ON "profile_views" USING btree ("viewer_id");--> statement-breakpoint
CREATE INDEX "swipes_booker_role_created_idx" ON "swipes" USING btree ("booker_id","role_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "swipes_talent_id_idx" ON "swipes" USING btree ("talent_id");--> statement-breakpoint
CREATE INDEX "swipes_role_id_idx" ON "swipes" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "talent_exposure_daily_day_idx" ON "talent_exposure_daily" USING btree ("day");--> statement-breakpoint
-- Default-deny (0000/0001): RLS on, no policies. anon/authenticated keep SELECT through default
-- privileges and get zero rows; castly_api bypasses RLS.
ALTER TABLE "deck_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "deck_queue" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "swipes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "deck_impressions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "talent_exposure_daily" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "profile_views" ENABLE ROW LEVEL SECURITY;
