/**
 * Deck payload sizes against the TECH_SPEC §25 decision-layer budget (150KB per card): the JSON
 * each card adds to the `deck.preview` response, and the bytes of its decision-layer image (the
 * lead photo at card size). Run against the seeded deck (`seed:deck`):
 *
 *   pnpm --filter api measure:deck-payload
 */
import { randomUUID } from "node:crypto"

import { db } from "../db.js"
import { previewDeck } from "../deck/preview.js"

const BUDGET_BYTES = 150 * 1024

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)}KB`

async function imageBytes(url: string): Promise<number | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    return (await response.arrayBuffer()).byteLength
  } catch {
    return null
  }
}

// Any id that is not a talent: the viewer only filters out its own card.
const { cards } = await previewDeck(db, randomUUID(), 50)
if (cards.length === 0) {
  console.log("No live talents. Seed the deck first: pnpm --filter api seed:deck -- <donor-email>")
  process.exit(0)
}

let over = 0
console.log("card                              json      image     total")
for (const card of cards) {
  const json = Buffer.byteLength(JSON.stringify(card))
  const lead = card.decision.leadMediaIds[0]
  const media = lead ? card.media[lead] : undefined
  const url = media?.variants?.card ?? media?.posterUrl ?? null
  const image = url ? await imageBytes(url) : 0
  const total = json + (image ?? 0)
  if (total > BUDGET_BYTES) over += 1
  console.log(
    `${card.talent.profile.displayName.slice(0, 32).padEnd(32)}  ${kb(json).padStart(8)}  ${(image === null ? "n/a" : kb(image)).padStart(8)}  ${kb(total).padStart(8)}${total > BUDGET_BYTES ? "  OVER" : ""}`,
  )
}
console.log(`\n${cards.length} cards, ${over} over the ${kb(BUDGET_BYTES)} budget`)
process.exit(0)
