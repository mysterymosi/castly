import { z } from "zod"

export const aboutConfigV1 = z.object({
  body: z.string().max(2000).optional(),
  mediaId: z.uuid().nullable().optional(),
})

export const galleryConfigV1 = z.object({
  mediaIds: z.array(z.uuid()).max(24).default([]),
  layout: z.enum(["grid", "masonry", "carousel"]).default("grid"),
})

export const showreelConfigV1 = z.object({
  mediaId: z.uuid().nullable(),
  headline: z.string().max(120).optional(),
})

export const creditsConfigV1 = z.object({
  signatureOnly: z.boolean().default(false),
  limit: z.number().int().min(1).max(50).optional(),
})

export const attributesConfigV1 = z.object({
  showHidden: z.boolean().default(false),
})

export const skillsConfigV1 = z.object({
  highlightTop: z.number().int().min(1).max(10).optional(),
})

export const languagesConfigV1 = z.object({
  showAccents: z.boolean().default(true),
})

export const ratesConfigV1 = z.object({
  showCurrency: z.boolean().default(true),
})

export const availabilityConfigV1 = z.object({
  horizonMonths: z.number().int().min(1).max(12).default(3),
})
