ALTER TABLE "swipes" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "swipes" ADD COLUMN "position" integer;--> statement-breakpoint
ALTER TABLE "swipes" ADD COLUMN "shortlist_id" uuid;--> statement-breakpoint
ALTER TABLE "swipes" ADD COLUMN "entry_added" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "swipes" ADD CONSTRAINT "swipes_session_id_deck_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."deck_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swipes" ADD CONSTRAINT "swipes_shortlist_id_shortlists_id_fk" FOREIGN KEY ("shortlist_id") REFERENCES "public"."shortlists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "swipes_session_position_live_uidx" ON "swipes" USING btree ("session_id","position") WHERE "swipes"."session_id" IS NOT NULL AND "swipes"."undone_at" IS NULL;--> statement-breakpoint
CREATE INDEX "swipes_session_id_idx" ON "swipes" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "swipes_shortlist_id_idx" ON "swipes" USING btree ("shortlist_id");--> statement-breakpoint
ALTER TABLE "swipes" ADD CONSTRAINT "swipes_session_has_position" CHECK ("swipes"."session_id" IS NULL OR "swipes"."position" IS NOT NULL);