import type { MetadataRoute } from "next"
import { connection } from "next/server"

import { getLiveTalentSlugs } from "@/lib/api"
import { siteUrl } from "@/lib/env"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Request-time so the build never calls the API. The slug list itself comes from the data
  // cache (see `getLiveTalentSlugs`), so a crawler hitting this repeatedly does not reach the API.
  await connection()
  const origin = siteUrl()
  const talents = await getLiveTalentSlugs()
  return [
    { url: origin, changeFrequency: "weekly", priority: 1 },
    ...talents.map((talent) => ({
      url: `${origin}/${talent.slug}`,
      lastModified: talent.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ]
}
