import type { Db } from "@workspace/db"
import { schema } from "@workspace/db"
import {
  deckFiltersSchema,
  type adminDeckRunInput,
  type adminDeckSessionInput,
  type AdminBookerSummary,
  type DeckReason,
} from "@workspace/schema"
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from "drizzle-orm"
import type { z } from "zod"

import { DeckError } from "../deck/errors.js"
import { resolveCandidateScope } from "../deck/candidates.js"
import { deckCard, type Card } from "../deck/preview.js"
import { loadRankingRows, rankingConfigFromRows } from "../deck/ranking-weights.js"
import { newSeed, rankCandidatesInDetail } from "../deck/session.js"
import { AdminError } from "./errors.js"
import { assertRankingSetting } from "./ranking-settings.js"

/** How many recent sessions the inspector lists for a booker. */
const RECENT_SESSIONS = 10

function bookerQuery(db: Db) {
  return db
    .select({
      id: schema.bookerProfiles.userId,
      email: schema.users.email,
      companyName: schema.bookerProfiles.companyName,
      vertical: schema.bookerProfiles.vertical,
      cityName: schema.cities.name,
    })
    .from(schema.bookerProfiles)
    .innerJoin(schema.users, eq(schema.users.id, schema.bookerProfiles.userId))
    .leftJoin(schema.cities, eq(schema.cities.id, schema.bookerProfiles.cityId))
}

/** `%` and `_` in a search are literal characters, not wildcards. */
const likeEscape = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`)

/** Bookers whose email or company name contains `query`. */
export async function searchBookers(db: Db, query: string): Promise<{ bookers: AdminBookerSummary[] }> {
  const pattern = `%${likeEscape(query)}%`
  const bookers = await bookerQuery(db)
    .where(or(ilike(schema.users.email, pattern), ilike(schema.bookerProfiles.companyName, pattern)))
    .orderBy(asc(schema.users.email))
    .limit(20)
  return { bookers }
}

async function bookerSummary(db: Db, bookerId: string) {
  const [booker] = await bookerQuery(db).where(eq(schema.bookerProfiles.userId, bookerId)).limit(1)
  if (!booker) throw new AdminError("Booker not found", "booker_not_found")
  return booker
}

/** Queue size and how many of those cards were served, per session. */
async function queueCounts(db: Db, sessionIds: string[]) {
  if (sessionIds.length === 0) return new Map<string, { queued: number; served: number }>()
  const rows = await db
    .select({
      sessionId: schema.deckQueue.sessionId,
      queued: count(),
      served: count(schema.deckQueue.servedAt),
    })
    .from(schema.deckQueue)
    .where(inArray(schema.deckQueue.sessionId, sessionIds))
    .groupBy(schema.deckQueue.sessionId)
  return new Map(rows.map((r) => [r.sessionId, { queued: r.queued, served: r.served }]))
}

/** A booker, their roles, and their latest sessions: what the inspector can run or open. */
export async function inspectorBooker(db: Db, bookerId: string) {
  const booker = await bookerSummary(db, bookerId)
  const roles = await db
    .select({
      id: schema.roles.id,
      name: schema.roles.name,
      projectName: schema.projects.name,
      briefed: isNotNull(schema.roles.brief),
    })
    .from(schema.roles)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.roles.projectId))
    .where(eq(schema.projects.bookerId, bookerId))
    .orderBy(asc(schema.projects.name), asc(schema.roles.name))
  const sessions = await db
    .select({
      id: schema.deckSessions.id,
      roleId: schema.deckSessions.roleId,
      roleName: schema.roles.name,
      seed: schema.deckSessions.seed,
      filters: schema.deckSessions.filters,
      startedAt: schema.deckSessions.startedAt,
    })
    .from(schema.deckSessions)
    .leftJoin(schema.roles, eq(schema.roles.id, schema.deckSessions.roleId))
    .where(eq(schema.deckSessions.bookerId, bookerId))
    .orderBy(desc(schema.deckSessions.startedAt))
    .limit(RECENT_SESSIONS)
  const counts = await queueCounts(
    db,
    sessions.map((s) => s.id),
  )
  return {
    booker,
    roles: roles.map((r) => ({ ...r, briefed: Boolean(r.briefed) })),
    sessions: sessions.map((s) => ({
      ...s,
      filters: deckFiltersSchema.parse(s.filters),
      startedAt: s.startedAt.toISOString(),
      ...(counts.get(s.id) ?? { queued: 0, served: 0 }),
    })),
  }
}

/** Cards as `viewerId` sees them, keyed by talent; talents with no profile are left out. */
async function cardsFor(db: Db, viewerId: string, talentIds: string[]) {
  if (talentIds.length === 0) return new Map<string, Card>()
  const profiles = await db
    .select()
    .from(schema.talentProfiles)
    .where(inArray(schema.talentProfiles.userId, talentIds))
  const cards = await Promise.all(profiles.map(async (p) => [p.userId, await deckCard(db, viewerId, p)] as const))
  return new Map(cards)
}

/**
 * Stages 1–3 as `deck.start` runs them for this booker, role and filters, writing nothing.
 * Each row carries stage 2's components, the exposure penalty and exploration flag from stage 3,
 * and the `reasons` that `deck.start` would store for it, so a position can be explained.
 * `overrides` replace stored settings for this run only.
 */
export async function runInspectorDeck(db: Db, input: z.output<typeof adminDeckRunInput>) {
  await bookerSummary(db, input.bookerId)
  for (const o of input.overrides) assertRankingSetting(o.key, o.value)

  const seed = input.seed ?? newSeed()
  const stored = await loadRankingRows(db)
  const rows = [...stored, ...input.overrides]
  const scope = await resolveCandidateScope(db, input.bookerId, input.roleId, input.filters, seed)
  const { scored, ranked, exposureThreshold } = await rankCandidatesInDetail(db, scope, rankingConfigFromRows(rows))

  const scoreRank = new Map(scored.map((c, i) => [c.talentId, i]))
  const top = ranked.slice(0, input.limit)
  const cards = await cardsFor(
    db,
    input.bookerId,
    top.map((c) => c.talentId),
  )
  return {
    seed,
    candidates: ranked.length,
    exposureThreshold,
    settings: [...new Map(rows.map((r) => [r.key, r])).values()],
    cards: top.flatMap((c, position) => {
      const card = cards.get(c.talentId)
      if (!card) return []
      return [
        {
          position,
          scoreRank: scoreRank.get(c.talentId)!,
          score: c.score,
          components: c.components,
          exposurePenalty: c.exposurePenalty,
          explored: c.explored,
          impressions7d: c.impressions7d,
          lifetimeImpressions: c.lifetimeImpressions,
          reasons: c.reasons as DeckReason[],
          card,
        },
      ]
    }),
  }
}

/** A real session's queue as `deck.start` and refills stored it, with each card's decision. */
export async function inspectSession(db: Db, input: z.output<typeof adminDeckSessionInput>) {
  const [session] = await db
    .select({
      id: schema.deckSessions.id,
      bookerId: schema.deckSessions.bookerId,
      roleId: schema.deckSessions.roleId,
      roleName: schema.roles.name,
      seed: schema.deckSessions.seed,
      filters: schema.deckSessions.filters,
      startedAt: schema.deckSessions.startedAt,
    })
    .from(schema.deckSessions)
    .leftJoin(schema.roles, eq(schema.roles.id, schema.deckSessions.roleId))
    .where(eq(schema.deckSessions.id, input.sessionId))
    .limit(1)
  if (!session) throw new DeckError("Deck session not found", "session_not_found")

  const queue = await db
    .select({
      position: schema.deckQueue.position,
      talentId: schema.deckQueue.talentId,
      score: schema.deckQueue.score,
      reasons: schema.deckQueue.reasons,
      servedAt: schema.deckQueue.servedAt,
      decision: schema.swipes.direction,
    })
    .from(schema.deckQueue)
    .leftJoin(
      schema.swipes,
      and(
        eq(schema.swipes.sessionId, schema.deckQueue.sessionId),
        eq(schema.swipes.position, schema.deckQueue.position),
        isNull(schema.swipes.undoneAt),
      ),
    )
    .where(eq(schema.deckQueue.sessionId, session.id))
    .orderBy(asc(schema.deckQueue.position))
    .limit(input.limit)
  const [{ queued } = { queued: 0 }] = await db
    .select({ queued: sql<number>`count(*)::int` })
    .from(schema.deckQueue)
    .where(eq(schema.deckQueue.sessionId, session.id))
  const cards = await cardsFor(
    db,
    session.bookerId,
    queue.map((q) => q.talentId),
  )

  return {
    session: {
      ...session,
      filters: deckFiltersSchema.parse(session.filters),
      startedAt: session.startedAt.toISOString(),
      queued,
    },
    cards: queue.map((q) => ({
      position: q.position,
      score: Number(q.score),
      reasons: q.reasons as DeckReason[],
      servedAt: q.servedAt?.toISOString() ?? null,
      decision: q.decision,
      card: cards.get(q.talentId) ?? null,
    })),
  }
}
