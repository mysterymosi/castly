import { sql } from "drizzle-orm"
import { check, index, pgEnum, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core"

import { primaryUuid, timestamptz } from "./columns.js"
import { users } from "./identity.js"
import { matches } from "./interest.js"
import { mediaAssets } from "./talent.js"

/**
 * The chat behind a match (TECH_SPEC §5.7, §13). `match_id` is NOT NULL with a foreign key, so
 * no conversation can exist without a match — the database enforces it, not the service. One per
 * match. CASCADE: a match only disappears with one of its two users, and the chat goes with it.
 */
export const conversations = pgTable(
  "conversations",
  {
    id: primaryUuid(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("conversations_match_id_uidx").on(table.matchId)],
)

/**
 * Who is in a conversation: exactly two rows, the booker and the talent, written with the match.
 * This table exists so the RLS policy on `messages` (6.3) can be a plain membership check — the
 * one place RLS carries real weight. `last_read_at` backs unread counts and `message.markRead`.
 */
export const conversationParticipants = pgTable(
  "conversation_participants",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastReadAt: timestamptz("last_read_at"),
  },
  (table) => [
    primaryKey({ columns: [table.conversationId, table.userId] }),
    // "My conversations", and the membership lookup RLS runs for every message read.
    index("conversation_participants_user_id_idx").on(table.userId),
  ],
)

/** What a message carries. Everything but `text` is a media message (TECH_SPEC §13). */
export const messageKind = pgEnum("message_kind", ["text", "image", "video", "audio", "document"])

/** The longest a message body may be; the API validates the same limit. */
export const MESSAGE_BODY_MAX = 4000

/**
 * One chat message (TECH_SPEC §5.7, §13). Written only by `message.send` (tRPC); read through
 * tRPC or, live, through Supabase Realtime under the RLS policy in 0019: a user sees a message
 * only when `conversation_participants` has them in its conversation. `conversation_id` is NOT
 * NULL with a foreign key, so a message cannot exist outside a conversation, nor a conversation
 * outside a match.
 *
 * `client_id` lets a retried send be recognised: a flaky connection resends the same request and
 * must not post the line twice. `deleted_at` hides a message from every read, Realtime included.
 */
export const messages = pgTable(
  "messages",
  {
    id: primaryUuid(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: messageKind("kind").notNull().default("text"),
    /** The text, or a media message's caption. */
    body: text("body"),
    /**
     * NO ACTION: a sent media message keeps its file. A user's deletion removes the message and
     * the media in one statement, which NO ACTION (unlike RESTRICT) allows.
     */
    mediaId: uuid("media_id").references(() => mediaAssets.id),
    clientId: uuid("client_id"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    deletedAt: timestamptz("deleted_at"),
  },
  (table) => [
    // A conversation's history, newest first. Ids are time-ordered (UUID v7), and pages walk
    // them by id alone — a timestamp cursor would lose precision between Postgres and JS.
    index("messages_conversation_id_idx").on(table.conversationId, table.id.desc()),
    index("messages_sender_id_idx").on(table.senderId),
    index("messages_media_id_idx").on(table.mediaId),
    uniqueIndex("messages_client_id_uidx").on(table.conversationId, table.senderId, table.clientId),
    check("messages_text_has_body", sql`${table.kind} <> 'text' OR btrim(coalesce(${table.body}, '')) <> ''`),
    check("messages_media_matches_kind", sql`(${table.kind} = 'text') = (${table.mediaId} IS NULL)`),
    check(
      "messages_body_length",
      sql`${table.body} IS NULL OR char_length(${table.body}) <= ${sql.raw(String(MESSAGE_BODY_MAX))}`,
    ),
  ],
)
