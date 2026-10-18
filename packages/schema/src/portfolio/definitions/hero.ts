import { z } from "zod"

export const heroType = "hero" as const

export const heroStyle = z.enum(["full_bleed", "video_loop", "split", "minimal"])

export const heroConfigV1 = z.object({
  style: heroStyle,
  mediaId: z.uuid().nullable(),
  headline: z.string().max(120).optional(),
  showBadges: z.boolean().default(true),
})

export const heroConfigV2 = heroConfigV1.extend({
  subtitle: z.string().max(120).optional(),
})

export type HeroConfigV1 = z.infer<typeof heroConfigV1>
export type HeroConfigV2 = z.infer<typeof heroConfigV2>

export const heroCurrentVersion = 2

export const heroSchemas = {
  1: heroConfigV1,
  2: heroConfigV2,
} as const

export function migrateHeroV1ToV2(body: unknown): HeroConfigV2 {
  const v1 = heroConfigV1.parse(body)
  return { ...v1, subtitle: undefined }
}

export const heroMigrators = {
  1: migrateHeroV1ToV2,
} as const
