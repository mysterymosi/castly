CREATE TYPE "public"."interest_status" AS ENUM('pending', 'accepted', 'declined', 'expired');--> statement-breakpoint
CREATE TABLE "interests" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"booker_id" uuid NOT NULL,
	"talent_id" uuid NOT NULL,
	"role_id" uuid,
	"status" "interest_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "interests_not_self" CHECK ("interests"."booker_id" <> "interests"."talent_id"),
	CONSTRAINT "interests_expires_after_created" CHECK ("interests"."expires_at" > "interests"."created_at"),
	CONSTRAINT "interests_responded_at_matches" CHECK (("interests"."status" IN ('accepted', 'declined')) = ("interests"."responded_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"interest_id" uuid NOT NULL,
	"booker_id" uuid NOT NULL,
	"talent_id" uuid NOT NULL,
	"role_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "talent_profiles" ADD COLUMN "auto_accept_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "swipes" ADD COLUMN "interest_id" uuid;--> statement-breakpoint
ALTER TABLE "interests" ADD CONSTRAINT "interests_booker_id_booker_profiles_user_id_fk" FOREIGN KEY ("booker_id") REFERENCES "public"."booker_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interests" ADD CONSTRAINT "interests_talent_id_talent_profiles_user_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interests" ADD CONSTRAINT "interests_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_interest_id_interests_id_fk" FOREIGN KEY ("interest_id") REFERENCES "public"."interests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_booker_id_booker_profiles_user_id_fk" FOREIGN KEY ("booker_id") REFERENCES "public"."booker_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_talent_id_talent_profiles_user_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talent_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "interests_pending_uidx" ON "interests" USING btree ("booker_id","talent_id",coalesce("role_id", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE "interests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "interests_talent_status_created_idx" ON "interests" USING btree ("talent_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "interests_booker_id_idx" ON "interests" USING btree ("booker_id");--> statement-breakpoint
CREATE INDEX "interests_role_id_idx" ON "interests" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "interests_pending_expires_idx" ON "interests" USING btree ("expires_at") WHERE "interests"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "matches_interest_id_uidx" ON "matches" USING btree ("interest_id");--> statement-breakpoint
CREATE INDEX "matches_booker_created_idx" ON "matches" USING btree ("booker_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "matches_talent_created_idx" ON "matches" USING btree ("talent_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "matches_role_id_idx" ON "matches" USING btree ("role_id");--> statement-breakpoint
ALTER TABLE "swipes" ADD CONSTRAINT "swipes_interest_id_interests_id_fk" FOREIGN KEY ("interest_id") REFERENCES "public"."interests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "swipes_interest_id_idx" ON "swipes" USING btree ("interest_id");--> statement-breakpoint
-- Default-deny (0000/0001): RLS on, no policies. anon/authenticated keep SELECT through default
-- privileges and get zero rows; castly_api bypasses RLS. Interests and matches are read through
-- tRPC only — Realtime is granted on `messages` alone (6.3).
ALTER TABLE "interests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "matches" ENABLE ROW LEVEL SECURITY;
