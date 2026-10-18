import { z } from "zod"

export const audioConfigV1 = z.object({
  mediaId: z.uuid().nullable().optional(),
  title: z.string().max(120).optional(),
})

export const trainingConfigV1 = z.object({})

export const affiliationsConfigV1 = z.object({})

export const pressConfigV1 = z.object({})

export const testimonialsConfigV1 = z.object({})

export const socialConfigV1 = z.object({})

export const customConfigV1 = z.object({
  title: z.string().max(120),
  body: z.string().max(4000).optional(),
})
