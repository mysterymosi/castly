import { randomInt } from "node:crypto"

import { applyFairness, scoreCandidates, type DeckCandidate } from "@workspace/core"
import type { Db } from "@workspace/db"
import { schema } from "@workspace/db"
import type { DeckSession, deckStartInput } from "@workspace/schema"
import { and, desc, eq, ne, sql } from "drizzle-orm"
import type { z } from "zod"

import { BookerError } from "../booker/errors.js"
import { ProjectError } from "../project/errors.js"

/** Stage 1's cap (TECH_SPEC §7.1): enough for a session plus refills, small enough for one query. */
export const CANDIDATE_LIMIT = 500

/** A fresh session seed; Postgres `integer`. */
export function newSeed() {
  return randomInt(0, 2 ** 31 - 1)
}

/**
 * Stage 1, interim: live talents other than the booker, best quality first, ties broken by a
 * session-seeded hash so two sessions do not get identical decks. The hard filters (category,
 * geo, pass decay, blocks, booker filters) are added in M5 5.5.
 */
export async function generateCandidates(
  db: Db,
  bookerId: string,
  seed: number,
): Promise<DeckCandidate[]> {
  const ts = schema.talentSearch
  const rows = await db
    .select({
      talentId: ts.talentId,
      qualityScore: ts.qualityScore,
      categoryIds: ts.categoryIds,
      cityId: ts.cityId,
    })
    .from(ts)
    .where(and(eq(ts.status, "live"), ne(ts.talentId, bookerId)))
    .orderBy(desc(ts.qualityScore), sql`md5(${ts.talentId}::text || ${String(seed)})`)
    .limit(CANDIDATE_LIMIT)
  return rows.map((row) => ({ ...row, qualityScore: Number(row.qualityScore) }))
}

/** The booker's own role, or `role_not_found` — someone else's role looks missing. */
async function assertOwnRole(db: Db, bookerId: string, roleId: string) {
  const [owned] = await db
    .select({ id: schema.roles.id })
    .from(schema.roles)
    .innerJoin(schema.projects, eq(schema.roles.projectId, schema.projects.id))
    .where(and(eq(schema.roles.id, roleId), eq(schema.projects.bookerId, bookerId)))
    .limit(1)
  if (!owned) throw new ProjectError("Role not found", "role_not_found")
}

/**
 * `deck.start` (TECH_SPEC §7): opens a session, runs stages 1–3, and materialises the ranked
 * result into `deck_queue` so `deck.next` pages a fixed order. `seed` is only passed by tests and
 * replays; a real session draws a fresh one.
 */
export async function startDeck(
  db: Db,
  bookerId: string,
  input: z.output<typeof deckStartInput>,
  seed = newSeed(),
): Promise<DeckSession> {
  const [profile] = await db
    .select({ userId: schema.bookerProfiles.userId })
    .from(schema.bookerProfiles)
    .where(eq(schema.bookerProfiles.userId, bookerId))
    .limit(1)
  if (!profile) throw new BookerError("Finish your booker profile first", "profile_required")
  if (input.roleId) await assertOwnRole(db, bookerId, input.roleId)

  const ranked = applyFairness(scoreCandidates(await generateCandidates(db, bookerId, seed)))

  return db.transaction(async (tx) => {
    const [session] = await tx
      .insert(schema.deckSessions)
      .values({ bookerId, roleId: input.roleId, goalCount: input.goalCount, seed })
      .returning({ id: schema.deckSessions.id })
    if (ranked.length > 0) {
      await tx.insert(schema.deckQueue).values(
        ranked.map((card, position) => ({
          sessionId: session!.id,
          position,
          talentId: card.talentId,
          score: card.score.toFixed(4),
          reasons: card.reasons,
        })),
      )
    }
    return {
      sessionId: session!.id,
      roleId: input.roleId,
      goalCount: input.goalCount,
      queued: ranked.length,
    }
  })
}
