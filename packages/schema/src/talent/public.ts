import { z } from "zod"

import { mediaStatusOutput } from "../media"
import { talentDtoSchema } from "./dto"

/** Vanity slug as it appears in `castly.app/{slug}`. Lowercased so casing never 404s. */
export const talentSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/)

export const publicPortfolioInput = z.object({
  slug: talentSlugSchema,
})

/** A live talent as an anonymous web visitor sees it. */
export const publicPortfolioSchema = z.object({
  talent: talentDtoSchema,
  /** Names for `talent.skillIds`, in the same order. */
  skills: z.array(z.object({ id: z.uuid(), name: z.string() })),
  /** Ready media referenced by the visible sections, keyed by media id. */
  media: z.record(z.uuid(), mediaStatusOutput),
})

export const liveTalentSlugsSchema = z.array(
  z.object({
    slug: z.string(),
    updatedAt: z.string(),
  })
)

export type PublicPortfolio = z.infer<typeof publicPortfolioSchema>
export type LiveTalentSlug = z.infer<typeof liveTalentSlugsSchema>[number]
