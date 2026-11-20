CREATE TYPE "public"."message_kind" AS ENUM('text', 'image', 'video', 'audio', 'document');--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"kind" "message_kind" DEFAULT 'text' NOT NULL,
	"body" text,
	"media_id" uuid,
	"client_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "messages_text_has_body" CHECK ("messages"."kind" <> 'text' OR btrim(coalesce("messages"."body", '')) <> ''),
	CONSTRAINT "messages_media_matches_kind" CHECK (("messages"."kind" = 'text') = ("messages"."media_id" IS NULL)),
	CONSTRAINT "messages_body_length" CHECK ("messages"."body" IS NULL OR char_length("messages"."body") <= 4000)
);
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_conversation_id_idx" ON "messages" USING btree ("conversation_id","id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "messages_sender_id_idx" ON "messages" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "messages_media_id_idx" ON "messages" USING btree ("media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_client_id_uidx" ON "messages" USING btree ("conversation_id","sender_id","client_id");--> statement-breakpoint
-- Chat reads (M6 6.3, TECH_SPEC §13). Default-deny (0000/0001) stays on every other table.
-- Writes are never granted: messages are inserted by the API (`castly_api`), which bypasses RLS.
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- `authenticated` alone reads chat tables; `anon` has no business with them. (0001's default
-- privileges gave both roles SELECT on every new table.)
REVOKE ALL ON "messages" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON "conversation_participants" FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT ON "messages" TO authenticated;--> statement-breakpoint
GRANT SELECT ON "conversation_participants" TO authenticated;--> statement-breakpoint
-- A user sees their own membership rows and nobody else's. The messages policy below checks
-- membership through this table, under the reader's own RLS, so this policy is what lets it work.
CREATE POLICY "conversation_participants_select_own" ON "conversation_participants"
  FOR SELECT TO authenticated
  USING ("user_id" = (select auth.uid()));--> statement-breakpoint
-- The whole of chat's read security: a message is visible to a user only while
-- `conversation_participants` holds them in its conversation, and only until it is deleted.
CREATE POLICY "messages_select_member" ON "messages"
  FOR SELECT TO authenticated
  USING (
    "deleted_at" IS NULL
    AND EXISTS (
      SELECT 1 FROM "conversation_participants" cp
      WHERE cp."conversation_id" = "messages"."conversation_id"
        AND cp."user_id" = (select auth.uid())
    )
  );--> statement-breakpoint
-- Realtime streams inserts to subscribers, RLS applied per subscriber. Skipped where the
-- publication does not exist (a plain Postgres without Supabase Realtime).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "public"."messages";
  END IF;
END
$$;--> statement-breakpoint
-- Typing and presence ride private broadcast channels named `conversation:<conversation id>`,
-- never persisted. Realtime Authorization checks `realtime.messages`; only a participant may
-- join or send on their conversation's topic. Clients must open these channels as private.
DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL AND to_regprocedure('realtime.topic()') IS NOT NULL THEN
    CREATE POLICY "conversation_channel_read" ON realtime.messages
      FOR SELECT TO authenticated
      USING (
        realtime.messages.extension IN ('broadcast', 'presence')
        AND EXISTS (
          SELECT 1 FROM public.conversation_participants cp
          WHERE cp.conversation_id::text = split_part((select realtime.topic()), ':', 2)
            AND split_part((select realtime.topic()), ':', 1) = 'conversation'
            AND cp.user_id = (select auth.uid())
        )
      );
    CREATE POLICY "conversation_channel_write" ON realtime.messages
      FOR INSERT TO authenticated
      WITH CHECK (
        realtime.messages.extension IN ('broadcast', 'presence')
        AND EXISTS (
          SELECT 1 FROM public.conversation_participants cp
          WHERE cp.conversation_id::text = split_part((select realtime.topic()), ':', 2)
            AND split_part((select realtime.topic()), ':', 1) = 'conversation'
            AND cp.user_id = (select auth.uid())
        )
      );
  END IF;
END
$$;
