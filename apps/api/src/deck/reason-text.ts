import { deckReasonText, type RankingWeights } from "@workspace/core"
import { schema } from "@workspace/db"
import type { DeckReason } from "@workspace/schema"
import { inArray } from "drizzle-orm"

import type { CandidateScope, Reader } from "./candidates.js"
import type { Card } from "./preview.js"

/** Names of the taxonomy entries a role's `anyOf` requirement on `key` asks for. */
async function askedNames(db: Reader, scope: CandidateScope, key: "languages" | "accents") {
  const requirement = scope.scoring.role?.requirements.find((r) => r.key === key)?.requirement
  if (!requirement || !("anyOf" in requirement)) return new Set<string>()
  const table = key === "languages" ? schema.languages : schema.accents
  const rows = await db.select({ name: table.name }).from(table).where(inArray(table.slug, requirement.anyOf))
  return new Set(rows.map((row) => row.name))
}

/**
 * Builds the card's reason line for one session's scope. The line may name a talent's city, and
 * the languages and accents the role asked for, only as the serialized card shows them to this
 * booker — so it never says more than the card does.
 */
export async function reasonTexter(db: Reader, scope: CandidateScope, weights: RankingWeights) {
  const [languages, accents] = await Promise.all([
    askedNames(db, scope, "languages"),
    askedNames(db, scope, "accents"),
  ])
  return (card: Card, reasons: readonly DeckReason[]) =>
    deckReasonText(
      reasons,
      {
        cityName: card.talent.profile.cityName,
        matchedLanguages: card.talent.content.languages.map((l) => l.name).filter((n) => languages.has(n)),
        matchedAccents: card.talent.content.accents.map((a) => a.name).filter((n) => accents.has(n)),
      },
      weights,
    )
}
