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
})

export const studioStateSchema = z.object({
  talent: ownerTalentDtoSchema,
  completeness: completenessBreakdownSchema,
  cities: z.array(
    z.object({ id: z.uuid(), name: z.string(), slug: z.string() })
  ),
  skills: z.array(
    z.object({ id: z.uuid(), name: z.string(), slug: z.string() })
  ),
  /** Owned media referenced by the sections and card, keyed by media id. */
  media: z.record(z.uuid(), mediaStatusOutput),
})

export type StudioState = z.infer<typeof studioStateSchema>

export const updateStudioProfileInput = z.object({
  displayName: z.string().min(1).max(120).optional(),
  bio: z.string().max(2000).optional(),
  cityId: z.uuid().nullable().optional(),
  cardConfig: cardConfigSchema.partial().optional(),
})

export const completeQuickStartInput = z.object({
  displayName: z.string().min(1).max(120),
  cityId: z.uuid(),
  bio: z.string().min(1).max(280),
  skillIds: z.array(z.uuid()).min(3).max(10),
  /** Gallery section media ids — min 3 once media pipeline exists; placeholders allowed in M2.4. */
  photoMediaIds: z.array(z.uuid()).min(3).max(12),
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

export const setTalentSkillsInput = z.object({
  skillIds: z.array(z.uuid()).max(20),
})

export const setTalentAttributeInput = z.object({
  definitionKey: z.string().min(1),
  valueText: z.string().max(200).optional(),
  valueNum: z.number().optional(),
})
