import { serializeTalent } from "@workspace/core"
import type { Db } from "@workspace/db"
import { schema } from "@workspace/db"
import { and, asc, desc, eq, inArray } from "drizzle-orm"

import { getMediaStatuses } from "../media/service.js"
import { StudioError } from "./errors.js"
import { loadTalentRecord, sectionMediaIds } from "./record.js"

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

  const skillRows =
    talent.skillIds.length > 0
      ? await db
          .select({ id: schema.skills.id, name: schema.skills.name })
          .from(schema.skills)
          .where(inArray(schema.skills.id, talent.skillIds))
      : []
  const skillName = new Map(skillRows.map((s) => [s.id, s.name]))
  const skills = talent.skillIds.flatMap((id) => {
    const name = skillName.get(id)
    return name ? [{ id, name }] : []
  })

  // Only media the serialized (visible) sections or the card lead reference, once ready. The
  // card lead is the talent's chosen share image for the page's link preview.
  const mediaIds = new Set(sectionMediaIds(talent.sections))
  const { leadMediaId } = talent.profile.cardConfig
  if (leadMediaId) mediaIds.add(leadMediaId)
  const statuses = await getMediaStatuses(db, profile.userId, [...mediaIds])
  const media = Object.fromEntries(
    Object.entries(statuses).filter(([, m]) => m.status === "ready")
  )

  return { talent, skills, media }
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
