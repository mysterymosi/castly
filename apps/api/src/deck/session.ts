import { randomInt } from "node:crypto"

import { applyFairness, scoreCandidates } from "@workspace/core"
import type { Db } from "@workspace/db"
import { schema } from "@workspace/db"
import type { DeckSession, deckStartInput } from "@workspace/schema"
import type { z } from "zod"

import { generateCandidates, resolveCandidateScope } from "./candidates.js"
import { exposureThreshold } from "./exposure.js"
import { loadRankingConfig } from "./ranking-weights.js"

/** A fresh session seed; Postgres `integer`. */
export function newSeed() {
  return randomInt(0, 2 ** 31 - 1)
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
  const { weights, fairness } = await loadRankingConfig(db)
  const scored = scoreCandidates(await generateCandidates(db, scope), { ...scope.scoring, weights })
  const ranked = applyFairness(scored, {
    config: fairness,
    seed,
    exposureThreshold: await exposureThreshold(db, fairness.exposurePercentile),
  })

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
