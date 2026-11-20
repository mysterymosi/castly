import { randomUUID } from "node:crypto"

import { LOCAL_DATABASE_URL, schema } from "@workspace/db"
import { eq } from "drizzle-orm"
import postgres from "postgres"
import { afterAll, afterEach, describe, expect, it } from "vitest"

import { db } from "../db.js"
import { deleteUnusedMedia } from "../media/cleanup.js"
import {
  booker,
  caller,
  cleanupDeckFixtures,
  liveTalent,
  newUser,
  type Caller,
  world,
} from "../test/deck-fixtures.js"

/** Opens a deck session and serves it, returning the position of each talent. */
async function served(api: Caller, filters: object) {
  const { sessionId } = await api.deck.start({ filters })
  const page = await api.deck.next({ sessionId, limit: 20 })
  const at = (talentId: string) => page.cards.find((c) => c.talent.profile.userId === talentId)!.position
  return { sessionId, at }
}

/** A booker and a talent with an accepted interest, and a stranger who is in neither. */
async function chat(label: string) {
  const w = await world()
  const talentId = await liveTalent(w, `${label}-talent`)
  await db.insert(schema.userModes).values({ userId: talentId, mode: "talent" }).onConflictDoNothing()
  const talent = { userId: talentId, api: caller(talentId) }
  const b = await booker(w, `${label}-booker`)
  const { sessionId, at } = await served(b.api, w.filters)
  await b.api.deck.swipe({ sessionId, position: at(talentId), direction: "interest" })
  const [interest] = await db.select().from(schema.interests).where(eq(schema.interests.talentId, talentId))
  const { conversationId } = await talent.api.interest.accept({ interestId: interest!.id })
  const strangerId = await newUser(`${label}-stranger`)
  return { w, conversationId, talent, booker: b, stranger: { userId: strangerId, api: caller(strangerId) } }
}

/** A finished upload of the user's own, as the media pipeline leaves it. */
async function upload(ownerId: string, fields: { kind?: "image" | "video"; status?: "ready" | "pending" } = {}) {
  const id = randomUUID()
  await db.insert(schema.mediaAssets).values({
    id,
    ownerId,
    kind: fields.kind ?? "image",
    provider: "supabase",
    providerRef: `images/${ownerId}/${id}`,
    status: fields.status ?? "ready",
  })
  return id
}

async function pgCode(work: Promise<unknown>) {
  try {
    await work
  } catch (error) {
    return (error as { cause?: { code?: string } }).cause?.code
  }
  return undefined
}

const sql = postgres(process.env.DATABASE_URL ?? LOCAL_DATABASE_URL, { max: 1 })
afterAll(() => sql.end())

/** Runs `work` as a Supabase user over the Data API's path: role `authenticated` (or `anon`) and a JWT. */
function asUser<T>(userId: string | null, work: (tx: postgres.TransactionSql) => Promise<T>) {
  return sql.begin(async (tx) => {
    await tx.unsafe(`set local role ${userId ? "authenticated" : "anon"}`)
    if (userId) {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`
    }
    return work(tx)
  })
}

async function sqlCode(work: Promise<unknown>) {
  try {
    await work
  } catch (error) {
    return (error as { code?: string }).code
  }
  return undefined
}

describe("message.send and list", () => {
  afterEach(cleanupDeckFixtures)

  it("lets both sides talk, newest first", async () => {
    const c = await chat("talk")
    await c.booker.api.message.send({ conversationId: c.conversationId, body: "  Are you free on the 12th?  " })
    await c.talent.api.message.send({ conversationId: c.conversationId, body: "Yes, I am." })
    await c.booker.api.message.send({ conversationId: c.conversationId, body: "Great, details to follow." })

    const { messages, nextCursor } = await c.talent.api.message.list({ conversationId: c.conversationId })
    expect(messages.map((m) => m.body)).toEqual(["Great, details to follow.", "Yes, I am.", "Are you free on the 12th?"])
    expect(messages.map((m) => m.senderId)).toEqual([c.booker.userId, c.talent.userId, c.booker.userId])
    expect(messages.every((m) => m.kind === "text" && m.media === null)).toBe(true)
    expect(nextCursor).toBeNull()
  })

  it("pages through history without repeats or gaps", async () => {
    const c = await chat("pages")
    for (let i = 1; i <= 5; i++) {
      await c.booker.api.message.send({ conversationId: c.conversationId, body: `m${i}` })
    }
    const first = await c.talent.api.message.list({ conversationId: c.conversationId, limit: 2 })
    const second = await c.talent.api.message.list({
      conversationId: c.conversationId,
      limit: 2,
      cursor: first.nextCursor!,
    })
    const third = await c.talent.api.message.list({
      conversationId: c.conversationId,
      limit: 2,
      cursor: second.nextCursor!,
    })
    expect([first, second, third].flatMap((p) => p.messages.map((m) => m.body))).toEqual(["m5", "m4", "m3", "m2", "m1"])
    expect(third.nextCursor).toBeNull()
  })

  it("keeps a stranger out of a conversation, indistinguishably from one that doesn't exist", async () => {
    const c = await chat("stranger")
    await c.booker.api.message.send({ conversationId: c.conversationId, body: "private" })

    for (const conversationId of [c.conversationId, randomUUID()]) {
      await expect(c.stranger.api.message.list({ conversationId })).rejects.toMatchObject({ code: "NOT_FOUND" })
      await expect(c.stranger.api.message.send({ conversationId, body: "hi" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      })
      await expect(c.stranger.api.message.markRead({ conversationId })).rejects.toMatchObject({ code: "NOT_FOUND" })
    }
    expect(await db.select().from(schema.messages).where(eq(schema.messages.senderId, c.stranger.userId))).toEqual([])
  })

  it("rejects empty, oversized and malformed messages", async () => {
    const c = await chat("invalid")
    const send = (input: Record<string, unknown>) =>
      c.booker.api.message.send({ conversationId: c.conversationId, ...input } as never)

    await expect(send({ body: "   " })).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(send({})).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(send({ body: "x".repeat(4001) })).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(send({ body: "hi", mediaId: randomUUID() })).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(send({ kind: "image" })).rejects.toMatchObject({ code: "BAD_REQUEST" })
    // Documents and audio wait on a private upload path.
    await expect(send({ kind: "document", mediaId: randomUUID() })).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(send({ body: "x".repeat(4000) })).resolves.toMatchObject({ kind: "text" })
  })

  it("posts a retried send once", async () => {
    const c = await chat("retry")
    const clientId = randomUUID()
    const first = await c.booker.api.message.send({ conversationId: c.conversationId, body: "once", clientId })
    const again = await c.booker.api.message.send({ conversationId: c.conversationId, body: "once", clientId })
    expect(again.id).toBe(first.id)

    // Another sender may reuse the id: it is theirs to choose.
    const reply = await c.talent.api.message.send({ conversationId: c.conversationId, body: "ok", clientId })
    expect(reply.id).not.toBe(first.id)
    expect((await c.booker.api.message.list({ conversationId: c.conversationId })).messages).toHaveLength(2)
  })

  it("tracks reads: sending reads your own line, marking reads the whole chat, each side separately", async () => {
    const c = await chat("reads")
    const lastRead = async (userId: string) => {
      const [row] = await db
        .select({ at: schema.conversationParticipants.lastReadAt })
        .from(schema.conversationParticipants)
        .where(eq(schema.conversationParticipants.userId, userId))
      return row!.at
    }
    await c.booker.api.message.send({ conversationId: c.conversationId, body: "hello" })
    expect(await lastRead(c.booker.userId)).not.toBeNull()
    expect(await lastRead(c.talent.userId)).toBeNull()

    const marked = await c.talent.api.message.markRead({ conversationId: c.conversationId })
    expect((await lastRead(c.talent.userId))!.toISOString()).toBe(marked.lastReadAt)
  })

  it("cannot be stored without a conversation", async () => {
    const c = await chat("orphan")
    const insert = (values: object) => db.insert(schema.messages).values(values as never)
    expect(await pgCode(insert({ senderId: c.booker.userId, body: "x" }))).toBe("23502")
    expect(await pgCode(insert({ senderId: c.booker.userId, body: "x", conversationId: randomUUID() }))).toBe("23503")
  })
})

describe("media messages", () => {
  afterEach(cleanupDeckFixtures)

  it("sends an image of the sender's own, and the other side sees it with its variants", async () => {
    const c = await chat("media")
    const mediaId = await upload(c.booker.userId)
    const sent = await c.booker.api.message.send({
      conversationId: c.conversationId,
      kind: "image",
      mediaId,
      body: "Brief for the role",
    })
    expect(sent).toMatchObject({ kind: "image", body: "Brief for the role", media: { id: mediaId, status: "ready" } })

    const [seen] = (await c.talent.api.message.list({ conversationId: c.conversationId })).messages
    expect(seen!.media).toMatchObject({ id: mediaId, kind: "image" })
    expect(seen!.media!.variants).not.toBeNull()
  })

  it("refuses media that is someone else's, unfinished, the wrong kind, or already sent", async () => {
    const c = await chat("media-bad")
    const send = (kind: "image" | "video", mediaId: string) =>
      c.booker.api.message.send({ conversationId: c.conversationId, kind, mediaId })

    await expect(send("image", await upload(c.talent.userId))).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(send("image", await upload(c.booker.userId, { status: "pending" }))).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
    await expect(send("video", await upload(c.booker.userId, { kind: "image" }))).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
    await expect(send("image", randomUUID())).rejects.toMatchObject({ code: "BAD_REQUEST" })

    const once = await upload(c.booker.userId)
    await send("image", once)
    await expect(send("image", once)).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  it("keeps a sent file out of the cleanup that removes unused media", async () => {
    const c = await chat("media-keep")
    const kept = await upload(c.booker.userId)
    const unused = await upload(c.booker.userId)
    await c.booker.api.message.send({ conversationId: c.conversationId, kind: "image", mediaId: kept })

    const deleted = await deleteUnusedMedia(db, [kept, unused], { deleteFile: async () => {} })
    expect(deleted).toEqual([unused])
  })

  it("lets a booker start an upload, since they send media too", async () => {
    const c = await chat("media-upload")
    await expect(
      c.booker.api.media.createUploadUrl({ kind: "image", contentType: "image/jpeg" }),
    ).resolves.toMatchObject({ mediaId: expect.any(String) })
  })
})

describe("who can read messages directly (the Realtime path)", () => {
  afterEach(cleanupDeckFixtures)

  const countMessages = (tx: postgres.TransactionSql, conversationId: string) =>
    tx<{ n: number }[]>`select count(*)::int as n from public.messages where conversation_id = ${conversationId}`.then(
      (rows) => rows[0]!.n,
    )

  it("shows a conversation's messages to its two participants and to nobody else", async () => {
    const c = await chat("rls")
    await c.booker.api.message.send({ conversationId: c.conversationId, body: "one" })
    await c.talent.api.message.send({ conversationId: c.conversationId, body: "two" })

    expect(await asUser(c.booker.userId, (tx) => countMessages(tx, c.conversationId))).toBe(2)
    expect(await asUser(c.talent.userId, (tx) => countMessages(tx, c.conversationId))).toBe(2)
    expect(await asUser(c.stranger.userId, (tx) => countMessages(tx, c.conversationId))).toBe(0)
  })

  it("gives anon no access to chat tables at all", async () => {
    const c = await chat("rls-anon")
    expect(await sqlCode(asUser(null, (tx) => tx`select 1 from public.messages limit 1`))).toBe("42501")
    expect(await sqlCode(asUser(null, (tx) => tx`select 1 from public.conversation_participants limit 1`))).toBe("42501")
    expect(c.conversationId).toBeTruthy()
  })

  it("lets no signed-in user write messages through the Data API", async () => {
    const c = await chat("rls-write")
    const attempts = [
      (tx: postgres.TransactionSql) =>
        tx`insert into public.messages (conversation_id, sender_id, body) values (${c.conversationId}, ${c.booker.userId}, 'forged')`,
      (tx: postgres.TransactionSql) => tx`update public.messages set body = 'edited'`,
      (tx: postgres.TransactionSql) => tx`delete from public.messages`,
    ]
    for (const attempt of attempts) {
      expect(await sqlCode(asUser(c.booker.userId, attempt))).toBe("42501")
    }
  })

  it("shows a user only their own participant row, and no other chat table", async () => {
    const c = await chat("rls-members")
    const rows = await asUser(c.booker.userId, (tx) => tx<{ user_id: string }[]>`select user_id from public.conversation_participants`)
    expect(rows.map((r) => r.user_id)).toEqual([c.booker.userId])

    // Default-deny holds elsewhere: matches, conversations and interests read as empty.
    for (const table of ["matches", "conversations", "interests"]) {
      const [row] = await asUser(c.booker.userId, (tx) => tx.unsafe(`select count(*)::int as n from public.${table}`))
      expect(row!.n, table).toBe(0)
    }
  })

  it("stops showing a message once it is deleted", async () => {
    const c = await chat("rls-deleted")
    const sent = await c.booker.api.message.send({ conversationId: c.conversationId, body: "oops" })
    await db.update(schema.messages).set({ deletedAt: new Date() }).where(eq(schema.messages.id, sent.id))

    expect(await asUser(c.talent.userId, (tx) => countMessages(tx, c.conversationId))).toBe(0)
    expect((await c.talent.api.message.list({ conversationId: c.conversationId })).messages).toEqual([])
  })

  it("is published to Realtime, with typing channels limited to the conversation's participants", async () => {
    const [published] = await sql`select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'`
    expect(published).toBeDefined()
    const policies = await sql<{ policyname: string }[]>`select policyname from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname like 'conversation_channel_%'`
    expect(policies.map((p) => p.policyname).sort()).toEqual(["conversation_channel_read", "conversation_channel_write"])
  })
})
