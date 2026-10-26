import type { Db } from "@workspace/db"
import { schema } from "@workspace/db"
import { eq } from "drizzle-orm"

/**
 * Tells the web app to drop its cached copy of a talent's public page (and the sitemap) so
 * edits, unpublishing, and suspension show on the next visit instead of after the ISR window.
 * Best effort: the page's `revalidate` window is the backstop if this call is lost.
 * No-op until `CASTLY_WEB_URL` and `CASTLY_REVALIDATE_SECRET` are set.
 */
export async function revalidatePublicPortfolio(db: Db, userId: string) {
  const webUrl = process.env.CASTLY_WEB_URL
  const secret = process.env.CASTLY_REVALIDATE_SECRET
  if (!webUrl || !secret) return

  const [profile] = await db
    .select({
      slug: schema.talentProfiles.slug,
      publishedAt: schema.talentProfiles.publishedAt,
    })
    .from(schema.talentProfiles)
    .where(eq(schema.talentProfiles.userId, userId))
    .limit(1)
  // Never published: there is no cached public page to drop.
  if (!profile?.publishedAt) return

  const response = await fetch(`${webUrl.replace(/\/$/, "")}/api/revalidate`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ slug: profile.slug }),
    signal: AbortSignal.timeout(3_000),
  })
  if (!response.ok) {
    throw new Error(`web revalidate returned ${response.status}`)
  }
}

/** Fire-and-forget wrapper so a slow or down web app never fails the API request. */
export function schedulePublicPortfolioRevalidate(db: Db, userId: string) {
  revalidatePublicPortfolio(db, userId).catch((error: unknown) => {
    console.error(
      "web revalidate failed",
      error instanceof Error ? error.message : "unknown"
    )
  })
}
