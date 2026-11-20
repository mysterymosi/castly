CREATE TABLE "conversation_participants" (
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"last_read_at" timestamp with time zone,
	CONSTRAINT "conversation_participants_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"match_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_participants_user_id_idx" ON "conversation_participants" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_match_id_uidx" ON "conversations" USING btree ("match_id");--> statement-breakpoint
-- Matches made before this migration (6.1) get the conversation and two participants that
-- accepting now creates, so every match has a chat.
WITH new_conversations AS (
  INSERT INTO "conversations" ("match_id") SELECT "id" FROM "matches" RETURNING "id", "match_id"
)
INSERT INTO "conversation_participants" ("conversation_id", "user_id")
SELECT c."id", party."user_id"
FROM new_conversations c
JOIN "matches" m ON m."id" = c."match_id"
CROSS JOIN LATERAL (VALUES (m."booker_id"), (m."talent_id")) AS party("user_id");--> statement-breakpoint
-- Default-deny (0000/0001): RLS on, no policies. anon/authenticated keep SELECT through default
-- privileges and get zero rows; castly_api bypasses RLS. 6.3 grants `authenticated` read access
-- to `messages` through membership in `conversation_participants`; nothing here opens a table.
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "conversation_participants" ENABLE ROW LEVEL SECURITY;
