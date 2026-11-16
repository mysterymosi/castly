/**
 * End-to-end check of chat's live path against a running local Supabase (M6 6.3 acceptance):
 * a message one participant sends reaches the other over Realtime with no polling, and a third
 * user subscribed to the same conversation receives nothing. Also checks that the typing and
 * presence channel (private broadcast) admits participants and refuses a stranger.
 *
 * It builds a throwaway booker, talent and stranger, signs each in for a real access token,
 * opens real Realtime sockets, sends through `message.send`, then deletes everything it made.
 *
 *   SUPABASE_PUBLISHABLE_KEY=$(supabase status -o env | sed -n 's/^PUBLISHABLE_KEY=//p' | tr -d '"') \
 *     pnpm --filter api realtime:probe
 *
 * Needs SUPABASE_URL and SUPABASE_SECRET_KEY (as the API does) and the publishable (anon) key.
 */
import { randomUUID } from "node:crypto"

import { LOCAL_DATABASE_URL, schema } from "@workspace/db"
import postgres from "postgres"
import { eq } from "drizzle-orm"

import { db } from "../db.js"
import { booker, caller, cleanupDeckFixtures, liveTalent, newUser, world } from "../test/deck-fixtures.js"

const admin = postgres(process.env.DATABASE_URL ?? LOCAL_DATABASE_URL, { max: 1 })
const base = (process.env.SUPABASE_URL ?? "http://127.0.0.1:54321").replace(/\/$/, "")
const secretKey = process.env.SUPABASE_SECRET_KEY
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY
if (!secretKey || !publishableKey) {
  console.error("Set SUPABASE_SECRET_KEY and SUPABASE_PUBLISHABLE_KEY (see the header of this file).")
  process.exit(1)
}

/** A real access token for a seeded user: an admin-minted email OTP, exchanged at /verify. */
async function signIn(userId: string) {
  const [user] = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, userId))
  const email = user!.email!
  // The test helper inserts auth.users rows with NULL token columns, which GoTrue can't read back.
  await admin`
    update auth.users set
      confirmation_token = coalesce(confirmation_token, ''),
      recovery_token = coalesce(recovery_token, ''),
      email_change = coalesce(email_change, ''),
      email_change_token_new = coalesce(email_change_token_new, ''),
      email_change_token_current = coalesce(email_change_token_current, ''),
      phone_change = coalesce(phone_change, ''),
      phone_change_token = coalesce(phone_change_token, ''),
      reauthentication_token = coalesce(reauthentication_token, '')
    where id = ${userId}
  `
  const link = await fetch(`${base}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: secretKey!, authorization: `Bearer ${secretKey}`, "content-type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email }),
  })
  const body = (await link.json().catch(() => ({}))) as { email_otp?: string }
  const token = body.email_otp
  if (!token) throw new Error(`generate_link failed (${link.status}): ${JSON.stringify(body)}`)
  const verify = await fetch(`${base}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: publishableKey!, "content-type": "application/json" },
    body: JSON.stringify({ type: "email", email, token }),
  })
  const session = (await verify.json()) as { access_token?: string }
  if (!session.access_token) throw new Error(`verify failed (${verify.status})`)
  return session.access_token
}

type Frame = { topic: string; event: string; payload: any; ref: string | null }

/** One Realtime channel over a raw Phoenix socket: joins, then records every frame it receives. */
async function join(accessToken: string, name: string, config: Record<string, unknown>) {
  const socket = new WebSocket(`${base.replace(/^http/, "ws")}/realtime/v1/websocket?apikey=${publishableKey}&vsn=1.0.0`)
  const frames: Frame[] = []
  await new Promise<void>((resolve, reject) => {
    socket.onopen = () => resolve()
    socket.onerror = () => reject(new Error("Realtime socket failed to open"))
  })
  socket.onmessage = (event) => frames.push(JSON.parse(String(event.data)) as Frame)
  const topic = `realtime:${name}`
  socket.send(
    JSON.stringify({
      topic,
      event: "phx_join",
      ref: "1",
      payload: { config: { broadcast: { self: false }, presence: { key: "" }, ...config }, access_token: accessToken },
    }),
  )
  const settled = async () => {
    for (let i = 0; i < 50; i++) {
      const reply = frames.find((f) => f.event === "phx_reply" && f.ref === "1")
      if (reply) return reply.payload.status === "ok"
      await new Promise((r) => setTimeout(r, 100))
    }
    return false
  }
  const joined = await settled()
  // A rejected subscription can also arrive as a `system` error after an ok reply.
  await new Promise((r) => setTimeout(r, 500))
  const refused = frames.some((f) => f.event === "system" && f.payload?.status === "error")
  return {
    joined: joined && !refused,
    frames,
    inserted: () => frames.filter((f) => f.event === "postgres_changes").map((f) => f.payload.data.record as { body: string }),
    broadcasts: () => frames.filter((f) => f.event === "broadcast"),
    send: (payload: unknown) => socket.send(JSON.stringify({ topic, event: "broadcast", ref: null, payload })),
    close: () => socket.close(),
  }
}

const results: Array<[string, boolean]> = []
const check = (name: string, ok: boolean) => {
  results.push([name, ok])
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`)
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

try {
  const w = await world()
  const talentId = await liveTalent(w, "probe-talent")
  await db.insert(schema.userModes).values({ userId: talentId, mode: "talent" }).onConflictDoNothing()
  const talent = caller(talentId)
  const b = await booker(w, "probe-booker")
  const { sessionId } = await b.api.deck.start({ filters: w.filters })
  const page = await b.api.deck.next({ sessionId, limit: 20 })
  await b.api.deck.swipe({
    sessionId,
    position: page.cards.find((c) => c.talent.profile.userId === talentId)!.position,
    direction: "interest",
  })
  const [interest] = await db.select().from(schema.interests).where(eq(schema.interests.talentId, talentId))
  const { conversationId } = await talent.interest.accept({ interestId: interest!.id })
  const strangerId = await newUser("probe-stranger")

  const [bookerToken, talentToken, strangerToken] = await Promise.all([
    signIn(b.userId),
    signIn(talentId),
    signIn(strangerId),
  ])

  // Live messages: every user subscribes to this one conversation's inserts.
  const changes = {
    postgres_changes: [
      { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
    ],
  }
  const onTalent = await join(talentToken, `chat-${randomUUID()}`, changes)
  const onBooker = await join(bookerToken, `chat-${randomUUID()}`, changes)
  const onStranger = await join(strangerToken, `chat-${randomUUID()}`, changes)
  check("talent subscribes to the conversation", onTalent.joined)
  check("booker subscribes to the conversation", onBooker.joined)
  // Subscribing is allowed to anyone signed in; it is the policy that keeps the stranger silent.
  // Without this the next checks would also pass if the stranger's token were simply bad.
  check("the stranger's subscription is accepted, so their silence below is RLS, not a failed join", onStranger.joined)

  await wait(1000)
  await b.api.message.send({ conversationId, body: "Are you free on the 12th?" })
  await wait(2500)
  check("talent receives the booker's message live", onTalent.inserted().some((m) => m.body === "Are you free on the 12th?"))
  check("booker sees their own message on its channel too", onBooker.inserted().length === 1)
  check("a third user subscribed to the conversation receives nothing", onStranger.inserted().length === 0)

  // Typing / presence: private broadcast on `conversation:<id>`, restricted by realtime.messages policies.
  const topic = `conversation:${conversationId}`
  const typingTalent = await join(talentToken, topic, { private: true })
  const typingBooker = await join(bookerToken, topic, { private: true })
  const typingStranger = await join(strangerToken, topic, { private: true })
  check("a participant may join the typing channel", typingTalent.joined && typingBooker.joined)
  check("a stranger is refused the typing channel", !typingStranger.joined)
  typingBooker.send({ type: "broadcast", event: "typing", payload: { typing: true } })
  await wait(1500)
  check("typing reaches the other participant", typingTalent.broadcasts().some((f) => f.payload?.event === "typing"))

  for (const channel of [onTalent, onBooker, onStranger, typingTalent, typingBooker, typingStranger]) channel.close()
} finally {
  await cleanupDeckFixtures()
}

const failed = results.filter(([, ok]) => !ok)
console.log(failed.length === 0 ? "\nAll checks passed." : `\n${failed.length} check(s) failed.`)
await admin.end()
process.exit(failed.length === 0 ? 0 : 1)
