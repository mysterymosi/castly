import {
  computeCompleteness,
  portfolioTemplates,
  type PortfolioTemplateId,
} from "@workspace/core"
import type { Db } from "@workspace/db"
import { schema } from "@workspace/db"
import {
  cardConfigSchema,
  type CardConfig,
  type CoreSectionType,
  readStoredPortfolioSection,
  validatePortfolioSectionWrite,
} from "@workspace/schema"
import { randomUUID } from "node:crypto"

import { and, asc, eq } from "drizzle-orm"

import { StudioError } from "./errors.js"
import { runQualityScoreJob } from "./quality-score-job.js"
import { runSearchScoresJob } from "./search-scores-job.js"
import {
  defaultSchemaVersion,
  defaultSectionConfig,
} from "./section-defaults.js"

function slugFromUserId(userId: string) {
  return `talent-${userId.replace(/-/g, "").slice(0, 12)}`
}

async function ensureProfile(db: Db, userId: string) {
  const [existing] = await db
    .select()
    .from(schema.talentProfiles)
    .where(eq(schema.talentProfiles.userId, userId))
    .limit(1)
  if (existing) return existing

  const [created] = await db
    .insert(schema.talentProfiles)
    .values({
      userId,
      slug: slugFromUserId(userId),
      displayName: "New talent",
    })
    .returning()
  if (!created)
    throw new StudioError(
      "Could not create talent profile",
      "profile_create_failed"
    )
  return created
}

function photoCountFromSections(
  sections: { type: string; isVisible: boolean; config: unknown }[]
): number {
  let count = 0
  for (const section of sections) {
    if (!section.isVisible) continue
    if (section.type === "gallery") {
      const cfg = section.config as { mediaIds?: string[] }
      count += cfg.mediaIds?.length ?? 0
    }
    if (section.type === "hero") {
      const cfg = section.config as { mediaId?: string | null }
      if (cfg.mediaId) count += 1
    }
  }
  return count
}

async function loadCompleteness(db: Db, userId: string) {
  const profile = await ensureProfile(db, userId)
  const sections = await db
    .select()
    .from(schema.portfolioSections)
    .where(eq(schema.portfolioSections.talentId, userId))
    .orderBy(asc(schema.portfolioSections.position))

  const skillRows = await db
    .select()
    .from(schema.talentSkills)
    .where(eq(schema.talentSkills.talentId, userId))

  const visibleTypes = sections.filter((s) => s.isVisible).map((s) => s.type)
  const result = computeCompleteness({
    hasDisplayName:
      Boolean(profile.quickStartCompletedAt) ||
      (profile.displayName.trim().length > 0 &&
        profile.displayName !== "New talent"),
    hasCity: Boolean(profile.cityId),
    hasBio: Boolean(profile.bio?.trim()),
    photoCount: photoCountFromSections(sections),
    skillCount: skillRows.length,
    visibleSectionTypes: visibleTypes,
  })

  await db
    .update(schema.talentProfiles)
    .set({
      completenessScore: String(result.score),
      updatedAt: new Date(),
    })
    .where(eq(schema.talentProfiles.userId, userId))

  if (Number(profile.completenessScore) !== result.score) {
    await runSearchScoresJob(db, userId)
  }

  return result
}

export async function getStudioState(db: Db, userId: string) {
  const profile = await ensureProfile(db, userId)
  const sections = await db
    .select()
    .from(schema.portfolioSections)
    .where(eq(schema.portfolioSections.talentId, userId))
    .orderBy(asc(schema.portfolioSections.position))

  const skillRows = await db
    .select({ skillId: schema.talentSkills.skillId })
    .from(schema.talentSkills)
    .where(eq(schema.talentSkills.talentId, userId))

  const cities = await db
    .select({
      id: schema.cities.id,
      name: schema.cities.name,
      slug: schema.cities.slug,
    })
    .from(schema.cities)
    .where(eq(schema.cities.active, true))

  const skills = await db
    .select({
      id: schema.skills.id,
      name: schema.skills.name,
      slug: schema.skills.slug,
    })
    .from(schema.skills)
    .where(eq(schema.skills.active, true))

  const cityName = profile.cityId
    ? (cities.find((c) => c.id === profile.cityId)?.name ?? null)
    : null

  const cardConfig = cardConfigSchema.parse(profile.cardConfig ?? {})
  const completeness = await loadCompleteness(db, userId)

  return {
    profile: {
      userId: profile.userId,
      slug: profile.slug,
      displayName: profile.displayName,
      headline: profile.headline,
      bio: profile.bio,
      cityId: profile.cityId,
      cityName,
      cardConfig,
      quickStartCompletedAt:
        profile.quickStartCompletedAt?.toISOString() ?? null,
      completenessScore: completeness.score,
      status: profile.status,
      publishedAt: profile.publishedAt?.toISOString() ?? null,
      qualityScore: Number(profile.qualityScore),
    },
    sections: sections.map((s) => ({
      id: s.id,
      type: s.type as CoreSectionType,
      schemaVersion: s.schemaVersion,
      position: s.position,
      isVisible: s.isVisible,
      config: readStoredPortfolioSection({
        type: s.type as CoreSectionType,
        schemaVersion: s.schemaVersion,
        config: s.config,
      }).config,
    })),
    skillIds: skillRows.map((r) => r.skillId),
    completeness,
    cities,
    skills,
  }
}

export async function updateStudioProfile(
  db: Db,
  userId: string,
  input: {
    displayName?: string
    bio?: string
    cityId?: string | null
    cardConfig?: Partial<CardConfig>
  }
) {
  await ensureProfile(db, userId)
  const [current] = await db
    .select({ cardConfig: schema.talentProfiles.cardConfig })
    .from(schema.talentProfiles)
    .where(eq(schema.talentProfiles.userId, userId))
    .limit(1)

  const nextCard = cardConfigSchema.parse({
    ...cardConfigSchema.parse(current?.cardConfig ?? {}),
    ...input.cardConfig,
  })

  const patch: {
    displayName?: string
    bio?: string
    cityId?: string | null
    cardConfig: CardConfig
    updatedAt: Date
  } = { cardConfig: nextCard, updatedAt: new Date() }
  if (input.displayName !== undefined) patch.displayName = input.displayName
  if (input.bio !== undefined) patch.bio = input.bio
  if (input.cityId !== undefined) patch.cityId = input.cityId

  await db
    .update(schema.talentProfiles)
    .set(patch)
    .where(eq(schema.talentProfiles.userId, userId))

  return getStudioState(db, userId)
}

export async function completeQuickStart(
  db: Db,
  userId: string,
  input: {
    displayName: string
    cityId: string
    bio: string
    skillIds: string[]
    photoMediaIds: string[]
  }
) {
  await ensureProfile(db, userId)

  await db
    .delete(schema.talentSkills)
    .where(eq(schema.talentSkills.talentId, userId))
  if (input.skillIds.length > 0) {
    await db.insert(schema.talentSkills).values(
      input.skillIds.map((skillId) => ({
        talentId: userId,
        skillId,
      }))
    )
  }

  await db
    .update(schema.talentProfiles)
    .set({
      displayName: input.displayName,
      cityId: input.cityId,
      bio: input.bio,
      quickStartCompletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.talentProfiles.userId, userId))

  let [gallery] = await db
    .select()
    .from(schema.portfolioSections)
    .where(
      and(
        eq(schema.portfolioSections.talentId, userId),
        eq(schema.portfolioSections.type, "gallery")
      )
    )
    .limit(1)

  const galleryConfig = {
    mediaIds: input.photoMediaIds,
    layout: "grid" as const,
  }
  const galleryVersion = defaultSchemaVersion("gallery")
  validatePortfolioSectionWrite("gallery", galleryVersion, galleryConfig)

  if (gallery) {
    await db
      .update(schema.portfolioSections)
      .set({
        config: galleryConfig,
        schemaVersion: galleryVersion,
        isVisible: true,
        updatedAt: new Date(),
      })
      .where(eq(schema.portfolioSections.id, gallery.id))
  } else {
    const existing = await db
      .select({ position: schema.portfolioSections.position })
      .from(schema.portfolioSections)
      .where(eq(schema.portfolioSections.talentId, userId))
    const position = existing.length
    await db.insert(schema.portfolioSections).values({
      talentId: userId,
      type: "gallery",
      position,
      schemaVersion: galleryVersion,
      config: galleryConfig,
    })
  }

  return getStudioState(db, userId)
}

export async function createSection(
  db: Db,
  userId: string,
  type: CoreSectionType
) {
  await ensureProfile(db, userId)
  const schemaVersion = defaultSchemaVersion(type)
  const config = defaultSectionConfig(type)
  validatePortfolioSectionWrite(type, schemaVersion, config)

  const rows = await db
    .select({ position: schema.portfolioSections.position })
    .from(schema.portfolioSections)
    .where(eq(schema.portfolioSections.talentId, userId))

  const [created] = await db
    .insert(schema.portfolioSections)
    .values({
      talentId: userId,
      type,
      position: rows.length,
      schemaVersion,
      config,
    })
    .returning()

  await loadCompleteness(db, userId)
  return created
}

export async function updateSection(
  db: Db,
  userId: string,
  input: {
    sectionId: string
    schemaVersion: number
    config: unknown
    isVisible?: boolean
  }
) {
  const [row] = await db
    .select()
    .from(schema.portfolioSections)
    .where(
      and(
        eq(schema.portfolioSections.id, input.sectionId),
        eq(schema.portfolioSections.talentId, userId)
      )
    )
    .limit(1)
  if (!row) throw new StudioError("Section not found", "section_not_found")

  const type = row.type as CoreSectionType
  validatePortfolioSectionWrite(type, input.schemaVersion, input.config)

  await db
    .update(schema.portfolioSections)
    .set({
      config: input.config,
      schemaVersion: input.schemaVersion,
      isVisible: input.isVisible ?? row.isVisible,
      updatedAt: new Date(),
    })
    .where(eq(schema.portfolioSections.id, input.sectionId))

  await loadCompleteness(db, userId)
  return getStudioState(db, userId)
}

export async function reorderSections(
  db: Db,
  userId: string,
  sectionIds: string[]
) {
  const rows = await db
    .select({ id: schema.portfolioSections.id })
    .from(schema.portfolioSections)
    .where(eq(schema.portfolioSections.talentId, userId))

  const owned = new Set(rows.map((r) => r.id))
  if (sectionIds.some((id) => !owned.has(id))) {
    throw new StudioError(
      "Invalid section id in reorder list",
      "invalid_section_order"
    )
  }

  await db.transaction(async (tx) => {
    for (let position = 0; position < sectionIds.length; position++) {
      await tx
        .update(schema.portfolioSections)
        .set({ position, updatedAt: new Date() })
        .where(eq(schema.portfolioSections.id, sectionIds[position]!))
    }
  })

  return getStudioState(db, userId)
}

export async function deleteSection(db: Db, userId: string, sectionId: string) {
  await db
    .delete(schema.portfolioSections)
    .where(
      and(
        eq(schema.portfolioSections.id, sectionId),
        eq(schema.portfolioSections.talentId, userId)
      )
    )
  await loadCompleteness(db, userId)
  return getStudioState(db, userId)
}

export async function applyTemplate(
  db: Db,
  userId: string,
  templateId: PortfolioTemplateId
) {
  await ensureProfile(db, userId)
  const order = portfolioTemplates[templateId]

  await db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(schema.portfolioSections)
      .where(eq(schema.portfolioSections.talentId, userId))

    const byType = new Map(existing.map((s) => [s.type, s]))

    for (let position = 0; position < order.length; position++) {
      const type = order[position]!
      const schemaVersion = defaultSchemaVersion(type)
      const config = defaultSectionConfig(type)
      validatePortfolioSectionWrite(type, schemaVersion, config)

      const found = byType.get(type)
      if (found) {
        await tx
          .update(schema.portfolioSections)
          .set({
            position,
            isVisible: true,
            updatedAt: new Date(),
          })
          .where(eq(schema.portfolioSections.id, found.id))
      } else {
        await tx.insert(schema.portfolioSections).values({
          talentId: userId,
          type,
          position,
          schemaVersion,
          config,
        })
      }
    }
  })

  return getStudioState(db, userId)
}

export async function setTalentSkills(
  db: Db,
  userId: string,
  skillIds: string[]
) {
  await ensureProfile(db, userId)
  await db
    .delete(schema.talentSkills)
    .where(eq(schema.talentSkills.talentId, userId))
  if (skillIds.length > 0) {
    await db.insert(schema.talentSkills).values(
      skillIds.map((skillId) => ({
        talentId: userId,
        skillId,
      }))
    )
  }
  return getStudioState(db, userId)
}

export async function setTalentAttribute(
  db: Db,
  userId: string,
  input: { definitionKey: string; valueText?: string; valueNum?: number }
) {
  await ensureProfile(db, userId)
  const [definition] = await db
    .select()
    .from(schema.attributeDefinitions)
    .where(eq(schema.attributeDefinitions.key, input.definitionKey))
    .limit(1)
  if (!definition)
    throw new StudioError("Unknown attribute", "unknown_attribute")

  await db
    .insert(schema.talentAttributes)
    .values({
      talentId: userId,
      definitionId: definition.id,
      valueText: input.valueText,
      valueNum: input.valueNum != null ? String(input.valueNum) : null,
    })
    .onConflictDoUpdate({
      target: [
        schema.talentAttributes.talentId,
        schema.talentAttributes.definitionId,
      ],
      set: {
        valueText: input.valueText,
        valueNum: input.valueNum != null ? String(input.valueNum) : null,
      },
    })

  // Sensitive attributes never affect completeness — recompute without reading attribute values.
  return getStudioState(db, userId)
}

export async function publishTalent(db: Db, userId: string) {
  const profile = await ensureProfile(db, userId)
  if (profile.status === "suspended") {
    throw new StudioError("This profile is suspended", "profile_suspended")
  }

  const state = await getStudioState(db, userId)
  if (!state.completeness.canPublish) {
    throw new StudioError(
      "Finish quick start before publishing",
      "publish_not_ready"
    )
  }

  await db
    .update(schema.talentProfiles)
    .set({
      status: "live",
      publishedAt: profile.publishedAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.talentProfiles.userId, userId))

  await runQualityScoreJob(db, userId)
  await runSearchScoresJob(db, userId)
  return getStudioState(db, userId)
}

export async function unpublishTalent(db: Db, userId: string) {
  const profile = await ensureProfile(db, userId)
  if (profile.status === "suspended") {
    throw new StudioError("This profile is suspended", "profile_suspended")
  }
  if (profile.status === "draft") return getStudioState(db, userId)

  await db
    .update(schema.talentProfiles)
    .set({ status: "draft", updatedAt: new Date() })
    .where(eq(schema.talentProfiles.userId, userId))

  return getStudioState(db, userId)
}

/** Dev helper until M2.5 media pipeline — creates ready placeholder images for quick-start photos. */
export async function createPlaceholderPhotos(
  db: Db,
  userId: string,
  count: number
) {
  const ids: string[] = []
  for (let i = 0; i < count; i++) {
    const id = randomUUID()
    await db.insert(schema.mediaAssets).values({
      id,
      ownerId: userId,
      kind: "image",
      provider: "supabase",
      status: "ready",
      width: 1200,
      height: 1500,
    })
    ids.push(id)
  }
  return ids
}
