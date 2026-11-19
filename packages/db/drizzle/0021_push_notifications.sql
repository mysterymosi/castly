CREATE TYPE "public"."notification_cadence" AS ENUM('immediate', 'weekly');--> statement-breakpoint
CREATE TYPE "public"."notification_category" AS ENUM('interest', 'match', 'message', 'brief');--> statement-breakpoint
CREATE TABLE "notification_prefs" (
	"user_id" uuid NOT NULL,
	"category" "notification_category" NOT NULL,
	"enabled" boolean NOT NULL,
	"cadence" "notification_cadence" NOT NULL,
	"frequency_cap" integer,
	CONSTRAINT "notification_prefs_user_id_category_pk" PRIMARY KEY("user_id","category"),
	CONSTRAINT "notification_prefs_frequency_cap" CHECK ("notification_prefs"."frequency_cap" between 1 and 1000),
	CONSTRAINT "notification_prefs_weekly_brief" CHECK ("notification_prefs"."cadence" <> 'weekly' or "notification_prefs"."category" = 'brief')
);
--> statement-breakpoint
CREATE TABLE "push_notifications" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"user_id" uuid NOT NULL,
	"category" "notification_category" NOT NULL,
	"subject_id" uuid NOT NULL,
	"digest_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"queued_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "notification_prefs" ADD CONSTRAINT "notification_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_notifications" ADD CONSTRAINT "push_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "push_notifications_event_key" ON "push_notifications" USING btree ("user_id","category","subject_id");--> statement-breakpoint
CREATE INDEX "push_notifications_pending_idx" ON "push_notifications" USING btree ("id") WHERE "push_notifications"."processed_at" is null;--> statement-breakpoint
CREATE INDEX "push_notifications_cap_idx" ON "push_notifications" USING btree ("user_id","category","queued_at") WHERE "push_notifications"."queued_at" is not null;--> statement-breakpoint
ALTER TABLE "notification_prefs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "push_notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE SCHEMA "castly_jobs";--> statement-breakpoint
GRANT USAGE, CREATE ON SCHEMA "castly_jobs" TO castly_api;
