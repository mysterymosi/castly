import { z } from "zod"

export const mediaProviderReadyEventSchema = z.object({
  mediaId: z.uuid(),
  providerRef: z.string().min(1),
  kind: z.enum(["image", "video"]),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationMs: z.number().int().positive().optional(),
  posterUrl: z.string().url().optional(),
  blurhash: z.string().max(100).optional(),
})

export type MediaProviderReadyEvent = z.infer<typeof mediaProviderReadyEventSchema>
