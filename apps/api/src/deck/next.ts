import type { Db } from "@workspace/db"
import { schema } from "@workspace/db"
import {
  deckFiltersSchema,
  deckRelaxableFilterSchema,
  type DeckPage,
  type DeckReason,
  type deckNextInput,
} from "@workspace/schema"
import { and, asc, eq, exists, inArray, isNull, max, not, sql } from "drizzle-orm"
import type { z } from "zod"

import { countCandidates, resolveCandidateScope, type CandidateScope, type Reader } from "./candidates.js"
import { DeckError } from "./errors.js"
import { deckCard } from "./preview.js"
import { queueRows, rankCandidates } from "./session.js"

/** Refill the queue (TECH_SPEC §7.4) when serving a page would leave fewer unserved than this. */
export const REFILL_BELOW = 10

/**
 * A queued card can still be served: the talent is live and neither side has blocked the other.
 * The queue is fixed at write time; this keeps a talent who unpublished, was suspended or
 * blocked mid-session from being shown anyway.
 */
function servable(bookerId: string) {
  const q = schema.deckQueue
  const b = schema.blocks
  return and(
    exists(
      sql`(select 1 from ${schema.talentProfiles} tp where tp.user_id = ${q.talentId} and tp.status = 'live')`,
    ),
    not(
      exists(
        sql`(select 1 from ${b} where (${b.blockerId} = ${bookerId} and ${b.blockedId} = ${q.talentId})
          or (${b.blockerId} = ${q.talentId} and ${b.blockedId} = ${bookerId}))`,
      ),
    ),
  )
}

async function unservedCount(db: Reader, sessionId: string, bookerId: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.deckQueue)
    .where(
      and(
        eq(schema.deckQueue.sessionId, sessionId),
        isNull(schema.deckQueue.servedAt),
        servable(bookerId),
      ),
    )
  return row?.n ?? 0
}

/** Re-runs stages 1–3 for the session, skipping everyone already queued, and appends the result. */
async function refill(db: Reader & Pick<Db, "insert">, sessionId: string, scope: CandidateScope) {
  const ranked = await rankCandidates(db, { ...scope, excludeQueuedIn: sessionId })
  if (ranked.length === 0) return 0
  const [last] = await db
    .select({ position: max(schema.deckQueue.position) })
    .from(schema.deckQueue)
    .where(eq(schema.deckQueue.sessionId, sessionId))
  await db.insert(schema.deckQueue).values(queueRows(sessionId, ranked, (last?.position ?? -1) + 1))
  return ranked.length
}

/**
 * Filters whose removal would bring talent back, most first (TECH_SPEC §7.4) — never random
 * padding. Each is counted by resolving the scope again without it (so dropping `categoryIds`
 * falls back to the vertical's categories, as a fresh session would) and skipping everyone this
 * session already queued.
 */
async function relaxations(db: Reader, sessionId: string, scope: CandidateScope) {
  const suggestions: DeckPage["suggestions"] = []
  for (const filter of deckRelaxableFilterSchema.options) {
    if (scope.filters[filter] === undefined) continue
    const { [filter]: _dropped, ...rest } = scope.filters
    const relaxed = await resolveCandidateScope(db, scope.bookerId, scope.roleId, rest, scope.seed)
    const unlocks = await countCandidates(db, { ...relaxed, excludeQueuedIn: sessionId })
    if (unlocks > 0) suggestions.push({ filter, unlocks })
  }
  return suggestions.sort((a, b) => b.unlocks - a.unlocks)
}

/**
 * `deck.next`: serves the next page of the session's queue in position order, refilling it first
 * when it runs low. Serving marks the rows `served_at`, records an impression for each, and
 * counts it into today's `talent_exposure_daily` — the roll-up stage 3's exposure penalty reads,
 * kept current in the same transaction rather than by a nightly job. The session row is locked
 * for the duration, so two calls can't serve the same cards.
 */
export async function nextCards(
  db: Db,
  bookerId: string,
  input: z.output<typeof deckNextInput>,
) {
  const { page, remaining, scope } = await db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(schema.deckSessions)
      .where(and(eq(schema.deckSessions.id, input.sessionId), eq(schema.deckSessions.bookerId, bookerId)))
      .for("update")
      .limit(1)
    if (!session) throw new DeckError("Deck session not found", "session_not_found")
    if (session.endedAt) throw new DeckError("This deck session has ended", "session_ended")

    const scope = await resolveCandidateScope(
      tx,
      bookerId,
      session.roleId,
      deckFiltersSchema.parse(session.filters),
      session.seed,
    )
    let unserved = await unservedCount(tx, session.id, bookerId)
    if (unserved - input.limit < REFILL_BELOW) unserved += await refill(tx, session.id, scope)

    const page = await tx
      .select({
        position: schema.deckQueue.position,
        talentId: schema.deckQueue.talentId,
        reasons: schema.deckQueue.reasons,
      })
      .from(schema.deckQueue)
      .where(
        and(
          eq(schema.deckQueue.sessionId, session.id),
          isNull(schema.deckQueue.servedAt),
          servable(bookerId),
        ),
      )
      .orderBy(asc(schema.deckQueue.position))
      .limit(input.limit)

    if (page.length > 0) {
      const positions = page.map((row) => row.position)
      await tx
        .update(schema.deckQueue)
        .set({ servedAt: sql`now()` })
        .where(and(eq(schema.deckQueue.sessionId, session.id), inArray(schema.deckQueue.position, positions)))
      await tx.insert(schema.deckImpressions).values(
        page.map((row) => ({ sessionId: session.id, position: row.position, talentId: row.talentId })),
      )
      await tx
        .insert(schema.talentExposureDaily)
        .values(page.map((row) => ({ talentId: row.talentId, day: sql`current_date`, impressions: 1 })))
        .onConflictDoUpdate({
          target: [schema.talentExposureDaily.talentId, schema.talentExposureDaily.day],
          set: { impressions: sql`${schema.talentExposureDaily.impressions} + 1` },
        })
    }
    return { page, remaining: unserved - page.length, scope }
  })

  const profiles = page.length
    ? await db
        .select()
        .from(schema.talentProfiles)
        .where(inArray(schema.talentProfiles.userId, page.map((row) => row.talentId)))
    : []
  const byId = new Map(profiles.map((p) => [p.userId, p]))
  const cards = await Promise.all(
    page.map(async (row) => ({
      ...(await deckCard(db, bookerId, byId.get(row.talentId)!)),
      position: row.position,
      reasons: row.reasons as DeckReason[],
    })),
  )

  const exhausted = remaining <= 0
  return {
    cards,
    exhausted,
    suggestions: exhausted ? await relaxations(db, input.sessionId, scope) : [],
  }
}
