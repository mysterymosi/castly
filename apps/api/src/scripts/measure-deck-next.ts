/**
 * `deck.next` latency against its M5 5.8 budget (p95 < 400ms), on the seeded deck (`seed:deck`):
 * real portfolios and media, so card building costs what it will. Times the service call (queue
 * read, refill check, serve writes, card building) for a fresh session's first page, many times:
 *
 *   pnpm --filter api measure:deck-next
 *
 * Creates a throwaway booker and removes it after, restoring `talent_exposure_daily` for the
 * talents it served. Needs the admin `DATABASE_URL`; never point it at production.
 */
import { randomUUID } from "node:crypto"

import { LOCAL_DATABASE_URL, loadEnv, schema } from "@workspace/db"
import { and, eq, inArray, sql } from "drizzle-orm"
import postgres from "postgres"

import { db } from "../db.js"
import { nextCards } from "../deck/next.js"
import { startDeck } from "../deck/session.js"

loadEnv()

const SESSIONS = 40
const PAGE = 10
const BUDGET_MS = 400

const admin = postgres(process.env.DATABASE_URL ?? LOCAL_DATABASE_URL, { max: 1, onnotice: () => {} })

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!
}

// The busiest city among live talents, so the booker's deck is as full as the seed allows.
const [city] = await admin<{ city_id: string }[]>`
  select city_id from talent_search where status = 'live' and city_id is not null
  group by city_id order by count(*) desc limit 1
`
if (!city) {
  console.log("No live talents. Seed the deck first: pnpm --filter api seed:deck -- <donor-email>")
  process.exit(0)
}

const bookerId = randomUUID()
const email = `measure-next-${bookerId}@example.invalid`
await admin`
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', ${bookerId}, 'authenticated', 'authenticated',
          ${email}, '{}'::jsonb, '{}'::jsonb, now(), now())
`
await admin`insert into public.users (id, email, date_of_birth, status) values (${bookerId}, ${email}, '1990-01-01', 'active')`
// `other` has no vertical weights, so no category restriction: every live talent is a candidate.
await admin`insert into public.booker_profiles (user_id, vertical, city_id) values (${bookerId}, 'other', ${city.city_id})`

const live = await db
  .select({ talentId: schema.talentSearch.talentId })
  .from(schema.talentSearch)
  .where(eq(schema.talentSearch.status, "live"))
const talentIds = live.map((row) => row.talentId)
const today = await db
  .select()
  .from(schema.talentExposureDaily)
  .where(
    and(inArray(schema.talentExposureDaily.talentId, talentIds), eq(schema.talentExposureDaily.day, sql`current_date`)),
  )

try {
  const times: number[] = []
  let cards = 0
  for (let i = 0; i < SESSIONS; i++) {
    const { sessionId } = await startDeck(db, bookerId, { roleId: null, goalCount: null, filters: {} })
    const started = performance.now()
    const page = await nextCards(db, bookerId, { sessionId, limit: PAGE })
    times.push(performance.now() - started)
    cards = page.cards.length
  }
  const p95 = percentile(times, 95)
  console.log(`live talents: ${talentIds.length}, ${SESSIONS} sessions, first page of ${PAGE} (${cards} cards served)\n`)
  console.log(`p50 ${percentile(times, 50).toFixed(1)}ms   p95 ${p95.toFixed(1)}ms   max ${Math.max(...times).toFixed(1)}ms`)
  console.log(p95 < BUDGET_MS ? `Under the ${BUDGET_MS}ms p95 budget.` : `OVER the ${BUDGET_MS}ms p95 budget.`)
} finally {
  // Put today's exposure back as it was, then drop the booker (sessions, queue and impressions cascade).
  await db
    .delete(schema.talentExposureDaily)
    .where(
      and(inArray(schema.talentExposureDaily.talentId, talentIds), eq(schema.talentExposureDaily.day, sql`current_date`)),
    )
  if (today.length > 0) await db.insert(schema.talentExposureDaily).values(today)
  await admin`delete from public.users where id = ${bookerId}`
  await admin`delete from auth.users where id = ${bookerId}`
  await admin.end()
  process.exit(0)
}
