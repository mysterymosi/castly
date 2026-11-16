import { index, pgTable, primaryKey, uniqueIndex, uuid } from "drizzle-orm/pg-core"

import { primaryUuid, timestamptz } from "./columns.js"
import { users } from "./identity.js"
import { matches } from "./interest.js"

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
