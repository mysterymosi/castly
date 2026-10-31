import { randomInt } from "node:crypto"

import { applyFairness, scoreCandidates, type FairCandidate } from "@workspace/core"
import type { Db } from "@workspace/db"
import { schema } from "@workspace/db"
import type { DeckSession, deckStartInput } from "@workspace/schema"
import type { z } from "zod"

import { generateCandidates, resolveCandidateScope, type CandidateScope, type Reader } from "./candidates.js"
import { exposureThreshold } from "./exposure.js"
import { loadRankingConfig } from "./ranking-weights.js"

/** A fresh session seed; Postgres `integer`. */
export function newSeed() {
  return randomInt(0, 2 ** 31 - 1)
}

/** Stages 1–3 for a resolved scope: candidates, scored, then reordered for fairness. */
export async function rankCandidates(db: Reader, scope: CandidateScope): Promise<FairCandidate[]> {
  const { weights, fairness } = await loadRankingConfig(db)
  const scored = scoreCandidates(await generateCandidates(db, scope), { ...scope.scoring, weights })
  return applyFairness(scored, {
    config: fairness,
    seed: scope.seed,
    exposureThreshold: await exposureThreshold(db, fairness.exposurePercentile),
  })
}

/** `deck_queue` rows for ranked cards, numbered on from `start`. */
export function queueRows(sessionId: string, ranked: readonly FairCandidate[], start = 0) {
  return ranked.map((card, i) => ({
    sessionId,
    position: start + i,
    talentId: card.talentId,
    score: card.score.toFixed(4),
    reasons: card.reasons,
  }))
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
  const scope = await resolveCandidateScope(db, bookerId, input.roleId, input.filters, seed)
  const ranked = await rankCandidates(db, scope)

  return db.transaction(async (tx) => {
    const [session] = await tx
      .insert(schema.deckSessions)
      .values({
        bookerId,
        roleId: input.roleId,
        goalCount: input.goalCount,
        seed,
        filters: input.filters,
      })
      .returning({ id: schema.deckSessions.id })
    if (ranked.length > 0) await tx.insert(schema.deckQueue).values(queueRows(session!.id, ranked))
    return {
      sessionId: session!.id,
      roleId: input.roleId,
      goalCount: input.goalCount,
      queued: ranked.length,
    }
  })
}
