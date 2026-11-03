import { z } from "zod"

import { deckCardSchema, deckFiltersSchema, deckReasonSchema } from "./deck"

/**
 * Deck inspector and ranking settings (TECH_SPEC §19, M5 5.10). Admin-only: run a deck as a
 * booker and see every score component and reason per card, and tune `ranking_weights` live.
 */

/** Find a booker by email or company name. */
export const adminBookerSearchInput = z.object({ query: z.string().trim().min(2).max(120) })

export const adminBookerSummarySchema = z.object({
  id: z.uuid(),
  email: z.string().nullable(),
  companyName: z.string().nullable(),
  vertical: z.string(),
  cityName: z.string().nullable(),
})

export const adminBookerSearchSchema = z.object({ bookers: z.array(adminBookerSummarySchema) })

export const adminBookerIdInput = z.object({ bookerId: z.uuid() })

/** A booker with what the inspector can run their deck for: their roles and recent sessions. */
export const adminDeckBookerSchema = z.object({
  booker: adminBookerSummarySchema,
  roles: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      projectName: z.string(),
      briefed: z.boolean(),
    }),
  ),
  sessions: z.array(
    z.object({
      id: z.uuid(),
      roleId: z.uuid().nullable(),
      roleName: z.string().nullable(),
      seed: z.number().int(),
      filters: deckFiltersSchema,
      startedAt: z.string(),
      queued: z.number().int(),
      served: z.number().int(),
    }),
  ),
})

/** Rows of the inspector's tables; the API caps how many talents it builds cards for. */
const rowLimit = z.number().int().min(1).max(100).default(30)

export const rankingSettingValueSchema = z.object({ key: z.string().min(1).max(64), value: z.number() })

/**
 * Run stages 1–3 as the booker would, writing nothing: no session, no queue, no impressions.
 * `seed` replays a session's exploration draw; `overrides` try settings before saving them.
 */
export const adminDeckRunInput = z.object({
  bookerId: z.uuid(),
  roleId: z.uuid().nullable().default(null),
  filters: deckFiltersSchema.default({}),
  seed: z.number().int().min(0).max(2 ** 31 - 1).optional(),
  overrides: z.array(rankingSettingValueSchema).max(32).default([]),
  limit: rowLimit,
})

/** Every term's weighted contribution, zeros included. */
export const scoreComponentsSchema = z.object({
  vertical: z.number(),
  geo: z.number(),
  quality: z.number(),
  freshness: z.number(),
  responsiveness: z.number(),
  role: z.number(),
  raisedHand: z.number(),
  boost: z.number(),
})

export const adminDeckRunCardSchema = z.object({
  position: z.number().int(),
  /** Where stage 2's score alone would have put the card; fairness moves it to `position`. */
  scoreRank: z.number().int(),
  score: z.number(),
  components: scoreComponentsSchema,
  exposurePenalty: z.number(),
  explored: z.boolean(),
  impressions7d: z.number().int(),
  lifetimeImpressions: z.number().int(),
  /** Exactly what `deck.start` would write to `deck_queue.reasons`. */
  reasons: z.array(deckReasonSchema),
  /** The card as this booker would see it. */
  card: deckCardSchema,
})

export const adminDeckRunSchema = z.object({
  seed: z.number().int(),
  candidates: z.number().int(),
  exposureThreshold: z.number(),
  /** The settings this run used: stored values with any overrides on top. */
  settings: z.array(rankingSettingValueSchema),
  cards: z.array(adminDeckRunCardSchema),
})

export const adminDeckSessionInput = z.object({ sessionId: z.uuid(), limit: rowLimit })

/** A real session's queue as stored: the score and reasons written when each card was ranked. */
export const adminDeckSessionSchema = z.object({
  session: z.object({
    id: z.uuid(),
    bookerId: z.uuid(),
    roleId: z.uuid().nullable(),
    roleName: z.string().nullable(),
    seed: z.number().int(),
    filters: deckFiltersSchema,
    startedAt: z.string(),
    queued: z.number().int(),
  }),
  cards: z.array(
    z.object({
      position: z.number().int(),
      score: z.number(),
      reasons: z.array(deckReasonSchema),
      servedAt: z.string().nullable(),
      decision: z.enum(["pass", "interest", "save"]).nullable(),
      card: deckCardSchema.nullable(),
    }),
  ),
})

export const rankingSettingsSchema = z.object({
  settings: z.array(
    z.object({
      key: z.string(),
      group: z.enum(["scoring", "fairness"]),
      label: z.string(),
      description: z.string(),
      kind: z.enum(["weight", "fraction", "count"]),
      defaultValue: z.number(),
      /** The stored value, or null when the default applies. */
      value: z.number().nullable(),
      updatedBy: z.string().nullable(),
      updatedAt: z.string().nullable(),
    }),
  ),
  /** How long the API may keep serving the previous values after an edit. */
  cacheSeconds: z.number().int(),
})

/** Set a setting, or reset it to its default with `value: null`. */
export const rankingSettingUpdateInput = z.object({
  key: z.string().min(1).max(64),
  value: z.number().nullable(),
})

export type AdminBookerSummary = z.infer<typeof adminBookerSummarySchema>
export type AdminDeckBooker = z.infer<typeof adminDeckBookerSchema>
export type AdminDeckRun = z.infer<typeof adminDeckRunSchema>
export type AdminDeckRunCard = z.infer<typeof adminDeckRunCardSchema>
export type AdminDeckSession = z.infer<typeof adminDeckSessionSchema>
export type RankingSettings = z.infer<typeof rankingSettingsSchema>
export type ScoreComponents = z.infer<typeof scoreComponentsSchema>
