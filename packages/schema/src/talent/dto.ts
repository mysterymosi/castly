import { z } from "zod"

import { corePortfolioSectionTypes } from "../portfolio/types"

/**
 * Talent payloads leave the API only through `serializeTalent` in `packages/core` (TECH_SPEC §6.1).
 * The brand is on the schema's input type, so a procedure whose `.output()` contains one of these
 * schemas only compiles when it returns a value `serializeTalent` produced. Never cast to these types.
 */
const serializedTalentBrand = "SerializedTalent"

export const cardConfigSchema = z.object({
  /** Superseded by the Main photo (`talent_photos` position 0); kept so stored configs parse. */
  leadMediaId: z.uuid().nullable().default(null),
  /** The deck card's looping canvas (`canvas.ts`); set only through `studio.setCanvas`. */
  canvasMediaId: z.uuid().nullable().default(null),
  /**
   * Whether the card leads with the canvas or the photos. The talent chooses in the studio; the
   * canvas stays uploaded when off. Bookers have no switch of their own.
   */
  canvasEnabled: z.boolean().default(true),
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

/**
 * Rows the list sections display, already filtered for the viewer by `serializeTalent`
 * (attributes: visible, standard tier only). Rates travel separately in `rates`, which is
 * absent when the viewer may not see them.
 */
export const talentContentDtoSchema = z.object({
  credits: z.array(
    z.object({
      title: z.string(),
      roleName: z.string().nullable(),
      productionCompany: z.string().nullable(),
      year: z.number().int().nullable(),
      type: z.string().nullable(),
      link: z.string().nullable(),
      isSignature: z.boolean(),
      verified: z.boolean(),
    })
  ),
  attributes: z.array(z.object({ label: z.string(), value: z.string() })),
  skills: z.array(z.object({ name: z.string() })),
  languages: z.array(z.object({ name: z.string(), fluency: z.string().nullable() })),
  accents: z.array(z.object({ name: z.string() })),
  availability: z.array(
    z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/),
      status: z.enum(["available", "partial", "booked"]),
    })
  ),
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
    /** The talent's photos in studio order; the first is Main. Public, like the page itself. */
    photoMediaIds: z.array(z.uuid()),
    skillIds: z.array(z.uuid()),
    content: talentContentDtoSchema,
    rates: z.array(talentRateDtoSchema).optional(),
  })
  .brand<typeof serializedTalentBrand, "inout">()

/** The owner's own view: every field present. */
export const ownerTalentDtoSchema = z
  .object({
    profile: z.object({ ...publicProfileShape, ...ownerProfileShape }),
    sections: z.array(talentSectionDtoSchema),
    photoMediaIds: z.array(z.uuid()),
    skillIds: z.array(z.uuid()),
    content: talentContentDtoSchema,
    rates: z.array(talentRateDtoSchema),
  })
  .brand<typeof serializedTalentBrand, "inout">()

export type TalentRateDto = z.infer<typeof talentRateDtoSchema>
export type TalentSectionDto = z.infer<typeof talentSectionDtoSchema>
export type TalentContentDto = z.infer<typeof talentContentDtoSchema>
export type TalentDto = z.input<typeof talentDtoSchema>
export type OwnerTalentDto = z.input<typeof ownerTalentDtoSchema>
