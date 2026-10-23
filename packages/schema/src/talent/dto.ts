import { z } from "zod"

import { corePortfolioSectionTypes } from "../portfolio/types"

/**
 * Talent payloads leave the API only through `serializeTalent` in `packages/core` (TECH_SPEC §6.1).
 * The brand is on the schema's input type, so a procedure whose `.output()` contains one of these
 * schemas only compiles when it returns a value `serializeTalent` produced. Never cast to these types.
 */
const serializedTalentBrand = "SerializedTalent"

export const cardConfigSchema = z.object({
  leadMediaId: z.uuid().nullable().default(null),
  highlightFacts: z.array(z.string().max(80)).max(3).default([]),
})

export type CardConfig = z.infer<typeof cardConfigSchema>

export const talentRateDtoSchema = z.object({
  kind: z.enum(["day", "half_day", "project"]),
  amountMin: z.number().nullable(),
  amountMax: z.number().nullable(),
  currency: z.string(),
  negotiable: z.boolean(),
})

export const talentSectionDtoSchema = z.object({
  id: z.uuid(),
  type: z.enum(corePortfolioSectionTypes),
  schemaVersion: z.number().int().min(1),
  position: z.number().int(),
  isVisible: z.boolean(),
  config: z.unknown(),
})

const publicProfileShape = {
  userId: z.uuid(),
  slug: z.string(),
  displayName: z.string(),
  headline: z.string().nullable(),
  bio: z.string().nullable(),
  cityId: z.uuid().nullable(),
  cityName: z.string().nullable(),
  cardConfig: cardConfigSchema,
  publishedAt: z.string().nullable(),
  rateVisibility: z.enum(["public", "verified_bookers", "hidden"]),
}

const ownerProfileShape = {
  status: z.enum(["draft", "live", "suspended"]),
  quickStartCompletedAt: z.string().nullable(),
  completenessScore: z.number(),
  qualityScore: z.number(),
}

/** What any viewer may receive. Owner-only fields and disallowed rates are absent, never null. */
export const talentDtoSchema = z
  .object({
    profile: z.object({
      ...publicProfileShape,
      status: ownerProfileShape.status.optional(),
      quickStartCompletedAt: ownerProfileShape.quickStartCompletedAt.optional(),
      completenessScore: ownerProfileShape.completenessScore.optional(),
      qualityScore: ownerProfileShape.qualityScore.optional(),
    }),
    sections: z.array(talentSectionDtoSchema),
    skillIds: z.array(z.uuid()),
    rates: z.array(talentRateDtoSchema).optional(),
  })
  .brand<typeof serializedTalentBrand, "inout">()

/** The owner's own view: every field present. */
export const ownerTalentDtoSchema = z
  .object({
    profile: z.object({ ...publicProfileShape, ...ownerProfileShape }),
    sections: z.array(talentSectionDtoSchema),
    skillIds: z.array(z.uuid()),
    rates: z.array(talentRateDtoSchema),
  })
  .brand<typeof serializedTalentBrand, "inout">()

export type TalentRateDto = z.infer<typeof talentRateDtoSchema>
export type TalentSectionDto = z.infer<typeof talentSectionDtoSchema>
export type TalentDto = z.input<typeof talentDtoSchema>
export type OwnerTalentDto = z.input<typeof ownerTalentDtoSchema>
