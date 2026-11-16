import type { Db } from "@workspace/db"
import { schema } from "@workspace/db"
import type { Message, MessageSendInput } from "@workspace/schema"
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm"

import { toMediaStatus } from "../media/service.js"
import { MessageError } from "./errors.js"

type MediaRow = typeof schema.mediaAssets.$inferSelect
type MessageRow = typeof schema.messages.$inferSelect

/**
 * The caller's place in a conversation. A stranger and a missing conversation look the same —
 * "not found" — so ids can't be probed for which chats exist.
 */
async function requireParticipant(db: Db, userId: string, conversationId: string) {
  const [row] = await db
    .select({ userId: schema.conversationParticipants.userId })
    .from(schema.conversationParticipants)
    .where(
      and(
        eq(schema.conversationParticipants.conversationId, conversationId),
        eq(schema.conversationParticipants.userId, userId),
      ),
    )
    .limit(1)
  if (!row) throw new MessageError("Conversation not found", "conversation_not_found")
}

function toMessage(row: MessageRow, media: MediaRow | null): Message {
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    kind: row.kind,
    body: row.body,
    media: media ? toMediaStatus(media) : null,
    createdAt: row.createdAt.toISOString(),
  }
}

async function loadMedia(db: Db, mediaId: string | null) {
  if (!mediaId) return null
  const [media] = await db.select().from(schema.mediaAssets).where(eq(schema.mediaAssets.id, mediaId)).limit(1)
  return media ?? null
}

/** An earlier send under the same client id, if the client is repeating itself. */
async function earlierSend(db: Db, userId: string, input: MessageSendInput) {
  if (!input.clientId) return null
  const [row] = await db
    .select()
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.conversationId, input.conversationId),
        eq(schema.messages.senderId, userId),
        eq(schema.messages.clientId, input.clientId),
      ),
    )
    .limit(1)
  return row ?? null
}

/**
 * A media message may carry only the sender's own finished upload of the matching kind, used
 * once. Anything else is refused with the same words, whichever rule it broke, so a sender can't
 * learn whether someone else's media id exists.
 */
async function requireUsableMedia(db: Db, userId: string, input: MessageSendInput) {
  const refuse = () => new MessageError("That upload can't be sent", "media_not_usable")
  const media = await loadMedia(db, input.mediaId ?? null)
  if (!media || media.ownerId !== userId) throw refuse()
  if (media.status !== "ready" || media.kind !== input.kind) throw refuse()
  const [attached] = await db
    .select({ id: schema.messages.id })
    .from(schema.messages)
    .where(eq(schema.messages.mediaId, media.id))
    .limit(1)
  if (attached) throw refuse()
  return media
}

/**
 * `message.send`: validates, stores, and returns the message. Realtime then streams the stored
 * row to the other participant (TECH_SPEC §13) — the write goes through here so validation, and
 * later moderation and notification fan-out, always run server-side.
 *
 * Idempotent on `clientId`: a repeat returns the message already stored. Sending also marks the
 * conversation read for the sender up to that message.
 */
export async function sendMessage(db: Db, userId: string, input: MessageSendInput): Promise<Message> {
  await requireParticipant(db, userId, input.conversationId)

  const earlier = await earlierSend(db, userId, input)
  if (earlier) return toMessage(earlier, await loadMedia(db, earlier.mediaId))

  const media = input.kind === "text" ? null : await requireUsableMedia(db, userId, input)

  const row = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(schema.messages)
      .values({
        conversationId: input.conversationId,
        senderId: userId,
        kind: input.kind,
        body: input.body ?? null,
        mediaId: media?.id ?? null,
        clientId: input.clientId ?? null,
      })
      .onConflictDoNothing()
      .returning()
    if (!created) return null
    await tx
      .update(schema.conversationParticipants)
      .set({ lastReadAt: sql`now()` })
      .where(
        and(
          eq(schema.conversationParticipants.conversationId, input.conversationId),
          eq(schema.conversationParticipants.userId, userId),
        ),
      )
    return created
  })
  // Lost a race with the same client id (or the media's single use): the other send stands.
  if (!row) {
    const winner = await earlierSend(db, userId, input)
    if (winner) return toMessage(winner, await loadMedia(db, winner.mediaId))
    throw new MessageError("That upload can't be sent", "media_not_usable")
  }
  return toMessage(row, media)
}

/** `message.list`: a conversation's messages, newest first, `limit` at a time. */
export async function listMessages(
  db: Db,
  userId: string,
  input: { conversationId: string; cursor?: string | undefined; limit: number },
) {
  await requireParticipant(db, userId, input.conversationId)

  const rows = await db
    .select({ message: schema.messages, media: schema.mediaAssets })
    .from(schema.messages)
    .leftJoin(schema.mediaAssets, eq(schema.mediaAssets.id, schema.messages.mediaId))
    .where(
      and(
        eq(schema.messages.conversationId, input.conversationId),
        isNull(schema.messages.deletedAt),
        input.cursor ? lt(schema.messages.id, input.cursor) : undefined,
      ),
    )
    .orderBy(desc(schema.messages.id))
    .limit(input.limit + 1)

  const page = rows.slice(0, input.limit)
  return {
    messages: page.map(({ message, media }) => toMessage(message, media)),
    nextCursor: rows.length > input.limit ? page[page.length - 1]!.message.id : null,
  }
}

/** `message.markRead`: the caller has read the conversation up to now. */
export async function markRead(db: Db, userId: string, conversationId: string) {
  const [row] = await db
    .update(schema.conversationParticipants)
    .set({ lastReadAt: sql`now()` })
    .where(
      and(
        eq(schema.conversationParticipants.conversationId, conversationId),
        eq(schema.conversationParticipants.userId, userId),
      ),
    )
    .returning({ lastReadAt: schema.conversationParticipants.lastReadAt })
  if (!row?.lastReadAt) throw new MessageError("Conversation not found", "conversation_not_found")
  return { lastReadAt: row.lastReadAt.toISOString() }
}
