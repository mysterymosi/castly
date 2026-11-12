import { z } from "zod"

import { mediaStatusOutput } from "../media"
import { corePortfolioSectionTypes } from "../portfolio/types"
import { cardConfigSchema, ownerTalentDtoSchema } from "./dto"

export const portfolioTemplateIdSchema = z.enum([
  "editorial",
  "reel_first",
  "case_study",
])

export const completenessBreakdownSchema = z.object({
  score: z.number().min(0).max(100),
  quickStartMet: z.boolean(),
  canPublish: z.boolean(),
  weights: z.object({
    profileBasics: z.number(),
    photos: z.number(),
    skills: z.number(),
    sections: z.number(),
    showreel: z.number(),
  }),
  /** The most valuable thing to add next (PRD §6.1 step 6), or null when nothing is left. */
  nextStep: z
    .object({ key: z.string(), label: z.string(), points: z.number() })
    .nullable(),
  /** What publishing still needs, in the order to fix it; empty when `canPublish`. */
  publishBlockers: z.array(z.enum(["quick_start", "category"])),
})

export const skillProficiencySchema = z.enum(["learning", "competent", "proficient", "expert"])
export const languageFluencySchema = z.enum(["basic", "conversational", "fluent", "native"])
export const rateVisibilitySchema = z.enum(["public", "verified_bookers", "hidden"])
export const availabilityStatusSchema = z.enum(["available", "partial", "booked"])
export const creditTypes = [
  "film",
  "tv",
  "commercial",
  "music_video",
  "theatre",
  "campaign",
] as const
export const creditTypeSchema = z.enum(creditTypes)

const taxonomyOption = z.object({ id: z.uuid(), name: z.string(), slug: z.string() })

export const attributeDefinitionOptionSchema = z.object({
  id: z.uuid(),
  key: z.string(),
  label: z.string(),
  dataType: z.enum(["text", "number", "boolean", "select", "multi_select"]),
  tier: z.enum(["standard", "sensitive"]),
  /** Empty means every category. */
  appliesToCategoryIds: z.array(z.uuid()),
  options: z.array(z.string()).nullable(),
})

export type AttributeDefinitionOption = z.infer<typeof attributeDefinitionOptionSchema>

/**
 * The owner's editable rows, with the ids the editors write back. `talent.content` holds the same
 * data as the portfolio renders it (names, no ids); this is what the studio edits.
 */
export const studioEditorSchema = z.object({
  willingToTravel: z.boolean(),
  openToRelocate: z.boolean(),
  credits: z.array(
    z.object({
      id: z.uuid(),
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
  skills: z.array(z.object({ skillId: z.uuid(), proficiency: skillProficiencySchema })),
  languages: z.array(z.object({ languageId: z.uuid(), fluency: languageFluencySchema })),
  accentIds: z.array(z.uuid()),
  /** Every stored value, sensitive included (the owner's own data); never serialized to others. */
  attributes: z.array(
    z.object({
      definitionId: z.uuid(),
      valueText: z.string().nullable(),
      valueNum: z.number().nullable(),
      valueBool: z.boolean().nullable(),
      isVisible: z.boolean(),
    })
  ),
  /** Active definitions the talent sets in the attributes editor (taxonomy keys excluded). */
  attributeDefinitions: z.array(attributeDefinitionOptionSchema),
  languageOptions: z.array(taxonomyOption),
  accentOptions: z.array(taxonomyOption),
})

export type StudioEditor = z.infer<typeof studioEditorSchema>

/** Photo slots in the studio grid. Slot 1 is "Main", the card's lead. */
export const PHOTO_SLOTS = 6

/** Replaces the talent's photos, in order: the first is Main. Removing a photo is a set without it. */
export const setTalentPhotosInput = z.object({
  mediaIds: z
    .array(z.uuid())
    .max(PHOTO_SLOTS)
    .refine((ids) => new Set(ids).size === ids.length, "Each photo once"),
})

/** Appends one uploaded photo to the end, if there is a free slot. */
export const addTalentPhotoInput = z.object({ mediaId: z.uuid() })

/** Puts an uploaded photo in another's slot (Main stays Main); the old one leaves the list. */
export const replaceTalentPhotoInput = z.object({ mediaId: z.uuid(), withMediaId: z.uuid() })

export const studioStateSchema = z.object({
  talent: ownerTalentDtoSchema,
  completeness: completenessBreakdownSchema,
  cities: z.array(
    z.object({ id: z.uuid(), name: z.string(), slug: z.string() })
  ),
  skills: z.array(
    z.object({ id: z.uuid(), name: z.string(), slug: z.string() })
  ),
  /** Active categories, the choices for `talent.categories.set`. */
  categories: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      slug: z.string(),
      kind: z.enum(["on_camera", "crew", "production", "events"]),
      parentId: z.uuid().nullable(),
    })
  ),
  /**
   * The talent's categories, primary first. A role with a category only sees talent in it (or a
   * subcategory), so a talent with none never reaches a role's deck.
   */
  categoryIds: z.array(z.uuid()),
  /** Owned media referenced by the sections and card, keyed by media id. */
  media: z.record(z.uuid(), mediaStatusOutput),
  editor: studioEditorSchema,
})

export type StudioState = z.infer<typeof studioStateSchema>

export const updateStudioProfileInput = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  headline: z.string().trim().max(120).nullable().optional(),
  bio: z.string().max(2000).optional(),
  cityId: z.uuid().nullable().optional(),
  willingToTravel: z.boolean().optional(),
  openToRelocate: z.boolean().optional(),
  /** Who sees rates. Never an input to completeness or ranking (PRD §7.3). */
  rateVisibility: rateVisibilitySchema.optional(),
  cardConfig: cardConfigSchema.omit({ canvasMediaId: true }).partial().optional(),
})

export const completeQuickStartInput = z.object({
  displayName: z.string().min(1).max(120),
  cityId: z.uuid(),
  bio: z.string().min(1).max(280),
  skillIds: z.array(z.uuid()).min(3).max(10),
  /** The first photos, Main first. */
  photoMediaIds: z
    .array(z.uuid())
    .min(3)
    .max(PHOTO_SLOTS)
    .refine((ids) => new Set(ids).size === ids.length, "Pick each photo once"),
  /** Primary first. Optional so older clients can still finish quick start. */
  categoryIds: z.array(z.uuid()).min(1).max(3).optional(),
})

export const createSectionInput = z.object({
  type: z.enum(corePortfolioSectionTypes),
})

export const updateSectionInput = z.object({
  sectionId: z.uuid(),
  schemaVersion: z.number().int().min(1),
  config: z.unknown(),
  isVisible: z.boolean().optional(),
})

export const reorderSectionsInput = z.object({
  sectionIds: z.array(z.uuid()).min(1).max(12),
})

export const deleteSectionInput = z.object({
  sectionId: z.uuid(),
})

export const createPlaceholderPhotosInput = z.object({
  count: z.number().int().min(1).max(12).default(3),
})

export const placeholderPhotosResultSchema = z.object({
  mediaIds: z.array(z.uuid()),
})

export const applyTemplateInput = z.object({
  templateId: portfolioTemplateIdSchema,
})

/** Primary first; replaces every category the talent had. */
export const setTalentCategoriesInput = z.object({
  categoryIds: z
    .array(z.uuid())
    .min(1)
    .max(3)
    .refine((ids) => new Set(ids).size === ids.length, "Pick each category once"),
})

const uniqueIds = (ids: string[]) => new Set(ids).size === ids.length

export const setTalentSkillsInput = z.object({
  skillIds: z.array(z.uuid()).max(20).refine(uniqueIds, "Pick each skill once"),
  /** Self-rated, per skill id; a skill without one keeps the default (`competent`). */
  proficiency: z.record(z.uuid(), skillProficiencySchema).optional(),
})

/**
 * Sets one attribute. With no value at all the row is deleted, unless only `isVisible` is given,
 * which changes visibility and keeps the value. The value must fit the definition's `data_type`.
 */
export const setTalentAttributeInput = z.object({
  definitionKey: z.string().min(1),
  valueText: z.string().trim().max(200).optional(),
  valueNum: z.number().finite().optional(),
  valueBool: z.boolean().optional(),
  isVisible: z.boolean().optional(),
})

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null))

/** `verifiedAt` is absent on purpose: only verification (M7) writes it. */
export const creditInput = z.object({
  title: z.string().trim().min(1).max(160),
  roleName: optionalText(120),
  productionCompany: optionalText(120),
  year: z.number().int().min(1900).max(2100).nullable().optional().transform((v) => v ?? null),
  type: creditTypeSchema.nullable().optional().transform((v) => v ?? null),
  link: z
    .union([z.url({ protocol: /^https?$/, error: "Use a full link, starting https://" }).max(500), z.literal("")])
    .nullable()
    .optional()
    .transform((v) => v || null),
  isSignature: z.boolean().default(false),
})

export const createCreditInput = creditInput
export const updateCreditInput = creditInput.extend({ creditId: z.uuid() })
export const deleteCreditInput = z.object({ creditId: z.uuid() })
export const reorderCreditsInput = z.object({
  creditIds: z.array(z.uuid()).min(1).max(100).refine(uniqueIds, "Each credit once"),
})

export const setTalentLanguagesInput = z.object({
  languages: z
    .array(z.object({ languageId: z.uuid(), fluency: languageFluencySchema }))
    .max(12)
    .refine((rows) => uniqueIds(rows.map((r) => r.languageId)), "Pick each language once"),
})

export const setTalentAccentsInput = z.object({
  accentIds: z.array(z.uuid()).max(12).refine(uniqueIds, "Pick each accent once"),
})

export const rateKindSchema = z.enum(["day", "half_day", "project"])

/** No amounts with `negotiable` on reads as "On request". */
export const talentRateInput = z
  .object({
    kind: rateKindSchema,
    amountMin: z.number().nonnegative().max(1e10).nullable(),
    amountMax: z.number().nonnegative().max(1e10).nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/).default("NGN"),
    negotiable: z.boolean().default(true),
  })
  .refine(
    (rate) => rate.amountMin === null || rate.amountMax === null || rate.amountMin <= rate.amountMax,
    { message: "The lowest amount can't be more than the highest", path: ["amountMax"] }
  )

export const setTalentRatesInput = z.object({
  rates: z
    .array(talentRateInput)
    .max(3)
    .refine((rows) => new Set(rows.map((r) => r.kind)).size === rows.length, "One rate per kind"),
})

export const availabilityMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM")

/** The months to store, current month onward; months not listed count as available. */
export const setTalentAvailabilityInput = z.object({
  months: z
    .array(z.object({ month: availabilityMonthSchema, status: availabilityStatusSchema }))
    .max(12)
    .refine((rows) => new Set(rows.map((r) => r.month)).size === rows.length, "Each month once"),
})

/** How many months the availability editor covers: the current month and the next 11. */
export const AVAILABILITY_WINDOW_MONTHS = 12

/** `YYYY-MM` for `offset` months after `now`'s month, in UTC. */
export function availabilityMonthKey(now: Date, offset = 0): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

/**
 * Whether an attribute definition applies to a talent in `categoryIds`: it applies to every
 * category, or names one of them or one of their ancestors (`parentOf` maps a category to its parent).
 */
export function attributeAppliesTo(
  definition: Pick<AttributeDefinitionOption, "appliesToCategoryIds">,
  categoryIds: string[],
  parentOf: (id: string) => string | null | undefined = () => null
): boolean {
  if (definition.appliesToCategoryIds.length === 0) return true
  const wanted = new Set(definition.appliesToCategoryIds)
  for (const start of categoryIds) {
    let id: string | null | undefined = start
    for (let depth = 0; id && depth < 8; depth++) {
      if (wanted.has(id)) return true
      id = parentOf(id)
    }
  }
  return false
}
