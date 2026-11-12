import { serializeTalent } from "@workspace/core"
import type { Db } from "@workspace/db"
import { schema } from "@workspace/db"
import { and, asc, desc, eq } from "drizzle-orm"

import { getMediaStatuses } from "../media/service.js"
import { StudioError } from "./errors.js"
import { loadTalentRecord, talentMediaIds } from "./record.js"

/**
 * A live portfolio as an anonymous visitor sees it. Draft, suspended, and unknown slugs are all
 * the same NOT_FOUND so a slug's existence is not revealed.
 */
export async function getPublicPortfolio(db: Db, slug: string) {
  const [profile] = await db
    .select()
    .from(schema.talentProfiles)
    .where(
      and(
        eq(schema.talentProfiles.slug, slug),
        eq(schema.talentProfiles.status, "live")
      )
    )
    .limit(1)
  if (!profile) throw new StudioError("Portfolio not found", "talent_not_found")

  const record = await loadTalentRecord(
    db,
    profile,
    Number(profile.completenessScore)
  )
  const talent = serializeTalent(record, { kind: "anonymous" }, {})

  // Only media the serialized (visible) sections and the photos reference, once ready. Main, the
  // first photo, is the page's link-preview image.
  const statuses = await getMediaStatuses(db, profile.userId, talentMediaIds(talent))
  const media = Object.fromEntries(
    Object.entries(statuses).filter(([, m]) => m.status === "ready")
  )

  return { talent, media }
}

export async function listLiveTalentSlugs(db: Db) {
  const rows = await db
    .select({
      slug: schema.talentProfiles.slug,
      updatedAt: schema.talentProfiles.updatedAt,
    })
    .from(schema.talentProfiles)
    .where(eq(schema.talentProfiles.status, "live"))
    .orderBy(desc(schema.talentProfiles.updatedAt), asc(schema.talentProfiles.slug))
    // The sitemap protocol caps a file at 50,000 URLs; split with generateSitemaps before then.
    .limit(50_000)
  return rows.map((r) => ({ slug: r.slug, updatedAt: r.updatedAt.toISOString() }))
}
