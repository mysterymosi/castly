import { z } from "zod"

import { mediaStatusOutput } from "./media"
import { roleRequirementsSchema } from "./project"
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

const ids = (max: number) => z.array(z.uuid()).min(1).max(max)

/**
 * The booker's filters (TECH_SPEC §8), the one object stage 1 and, from M8, search both take.
 * Each list matches any of its values; separate fields must all match. A talent with a hidden
 * or unset rate is never removed by `rateDayMax` (PRD §7.3). `attributes` is keyed by attribute
 * definition, shaped like role requirements: sensitive keys need an active role with a brief and
 * are only ever soft preferences, never exclusions.
 */
export const deckFiltersSchema = z
  .object({
    categoryIds: ids(20).optional(),
    cityIds: ids(50).optional(),
    regions: z.array(z.string().trim().min(1).max(64)).min(1).max(20).optional(),
    skillIds: ids(30).optional(),
    languageIds: ids(30).optional(),
    accentIds: ids(30).optional(),
    rateDayMax: z.number().min(0).max(9_999_999_999.99).optional(),
    hasShowreel: z.literal(true).optional(),
    minCredits: z.number().int().min(1).max(500).optional(),
    attributes: roleRequirementsSchema.optional(),
  })
  .strict()

/** A deck session, optionally for one of the booker's roles, with an optional card goal. */
export const deckStartInput = z
  .object({
    roleId: z.uuid().nullable().default(null),
    goalCount: z.number().int().min(1).max(500).nullable().default(null),
    filters: deckFiltersSchema.default({}),
  })
  .default({ roleId: null, goalCount: null, filters: {} })

/** The session `deck.next` (5.8) pages through, and how many cards its queue holds. */
export const deckSessionSchema = z.object({
  sessionId: z.uuid(),
  roleId: z.uuid().nullable(),
  goalCount: z.number().int().nullable(),
  queued: z.number().int(),
})

/** One "why this card" entry, as scoring wrote it to `deck_queue` (`DeckReason` in core). */
export const deckReasonSchema = z.object({
  code: z.enum([
    "vertical",
    "geo",
    "quality",
    "freshness",
    "responsiveness",
    "role",
    "raisedHand",
    "boost",
    "exposure",
    "exploration",
  ]),
  contribution: z.number(),
  detail: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
})

/** A served card: the card itself plus its place in the session's queue and why it is there. */
export const deckQueuedCardSchema = deckCardSchema.extend({
  position: z.number().int(),
  reasons: z.array(deckReasonSchema),
})

export const deckNextInput = z.object({
  sessionId: z.uuid(),
  limit: z.number().int().min(1).max(20).default(10),
})

/** The filters `deckFiltersSchema` holds that an exhausted deck may suggest dropping. */
export const deckRelaxableFilterSchema = z.enum([
  "categoryIds",
  "cityIds",
  "regions",
  "skillIds",
  "languageIds",
  "accentIds",
  "rateDayMax",
  "hasShowreel",
  "minCredits",
])

/**
 * A page of the session's queue. `exhausted` means nothing is left to serve, even after a refill;
 * `suggestions` then lists the filters whose removal would bring talent back, most first.
 */
export const deckPageSchema = z.object({
  cards: z.array(deckQueuedCardSchema),
  exhausted: z.boolean(),
  suggestions: z.array(z.object({ filter: deckRelaxableFilterSchema, unlocks: z.number().int() })),
})

export type CategoryKind = z.infer<typeof categoryKindSchema>
export type DeckDecision = z.infer<typeof deckDecisionSchema>
export type DeckCard = z.infer<typeof deckCardSchema>
export type DeckPreview = z.infer<typeof deckPreviewSchema>
export type DeckSession = z.infer<typeof deckSessionSchema>
export type DeckFilters = z.infer<typeof deckFiltersSchema>
export type DeckReason = z.infer<typeof deckReasonSchema>
export type DeckQueuedCard = z.infer<typeof deckQueuedCardSchema>
export type DeckPage = z.infer<typeof deckPageSchema>
export type DeckRelaxableFilter = z.infer<typeof deckRelaxableFilterSchema>
