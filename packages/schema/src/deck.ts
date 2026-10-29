import { z } from "zod"

import { mediaStatusOutput } from "./media"
import { talentDtoSchema } from "./talent/dto"

export const categoryKindSchema = z.enum(["on_camera", "crew", "production", "events"])

/**
 * What the card shows before any scrolling (PRD §7.2.1), derived server-side so the client never
 * re-implements visibility rules. Talent fields themselves stay inside the serialized `talent`.
 */
export const deckDecisionSchema = z.object({
  categoryName: z.string().nullable(),
  /** Crew, production and events cards open partially expanded; on-camera (or none) at the top. */
  categoryKind: categoryKindSchema.nullable(),
  /** From the visible playing-age attributes (on-camera only). */
  ageRange: z.object({ min: z.number().nullable(), max: z.number().nullable() }).nullable(),
  /** Card lead first, then hero and gallery photos; at most five, ready only. */
  leadMediaIds: z.array(z.uuid()).max(5),
  creditCount: z.number().int(),
  signatureCredit: z
    .object({ title: z.string(), roleName: z.string().nullable(), year: z.number().nullable() })
    .nullable(),
})

export const deckCardSchema = z.object({
  talent: talentDtoSchema,
  decision: deckDecisionSchema,
  /** Ready media referenced by the sections and the decision layer, keyed by id. */
  media: z.record(z.uuid(), mediaStatusOutput),
})

/** Interim deck source until `deck.start` / `deck.next` (M5 tasks 5.4 and 5.8) replace it. */
export const deckPreviewInput = z
  .object({ limit: z.number().int().min(1).max(30).default(20) })
  .default({ limit: 20 })

export const deckPreviewSchema = z.object({ cards: z.array(deckCardSchema) })

export type CategoryKind = z.infer<typeof categoryKindSchema>
export type DeckDecision = z.infer<typeof deckDecisionSchema>
export type DeckCard = z.infer<typeof deckCardSchema>
export type DeckPreview = z.infer<typeof deckPreviewSchema>
