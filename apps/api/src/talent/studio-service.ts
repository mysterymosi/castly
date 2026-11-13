import {
  computeCompleteness,
  portfolioLayoutFor,
  serializeTalent,
} from "@workspace/core"
import type { Db } from "@workspace/db"
import { schema } from "@workspace/db"
import {
  availabilityMonthKey,
  canvasProblem,
  cardConfigSchema,
  type CardConfig,
  type CoreSectionType,
  isTaxonomyAttributeKey,
} from "@workspace/schema"
import { randomUUID } from "node:crypto"

import { and, asc, count, desc, eq, gte, inArray, sql } from "drizzle-orm"

import { deckCard } from "../deck/preview.js"
import { scheduleMediaCleanup } from "../media/cleanup.js"
import { getMediaStatuses } from "../media/service.js"
import { StudioError } from "./errors.js"
import { countTalentPhotos, writeTalentPhotos } from "./photos.js"
import { loadTalentRecord, primaryCategoryKind, talentMediaIds } from "./record.js"
import { runQualityScoreJob } from "./quality-score-job.js"
import { runSearchScoresJob } from "./search-scores-job.js"

function slugFromUserId(userId: string) {
  return `talent-${userId.replace(/-/g, "").slice(0, 12)}`
}

/**
 * Stamps `content_updated_at` after an edit to something bookers see stored outside the profile row
 * (photos, credits, skills, …), then returns the fresh studio state. Profile-row edits set the stamp
 * in their own update.
 */
export async function contentEdited(db: Db, userId: string) {
  const now = new Date()
  await db
    .update(schema.talentProfiles)
    .set({ contentUpdatedAt: now, updatedAt: now })
    .where(eq(schema.talentProfiles.userId, userId))
  return getStudioState(db, userId)
}

export async function ensureProfile(db: Db, userId: string) {
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

async function countRows(
  db: Db,
  table:
    | typeof schema.credits
    | typeof schema.talentLanguages
    | typeof schema.talentRates
    | typeof schema.talentCategories,
  userId: string
) {
  const [row] = await db
    .select({ n: count() })
    .from(table)
    .where(eq(table.talentId, userId))
  return row?.n ?? 0
}

/**
 * Recomputes and stores completeness. Only standard-tier attributes are counted, and rate
 * visibility is never read, so neither sensitive data nor hiding rates moves the score.
 */
async function loadCompleteness(db: Db, userId: string) {
  const profile = await ensureProfile(db, userId)
  const skillRows = await db
    .select()
    .from(schema.talentSkills)
    .where(eq(schema.talentSkills.talentId, userId))

  const [standardAttributes] = await db
    .select({ n: count() })
    .from(schema.talentAttributes)
    .innerJoin(
      schema.attributeDefinitions,
      eq(schema.talentAttributes.definitionId, schema.attributeDefinitions.id)
    )
    .where(
      and(
        eq(schema.talentAttributes.talentId, userId),
        eq(schema.attributeDefinitions.tier, "standard"),
        eq(schema.attributeDefinitions.active, true)
      )
    )

  const [availabilityMonths] = await db
    .select({ n: count() })
    .from(schema.talentAvailability)
    .where(
      and(
        eq(schema.talentAvailability.talentId, userId),
        gte(schema.talentAvailability.month, availabilityMonthKey(new Date()))
      )
    )

  // Every section in the talent's layout counts once it has content; nothing is hidden by hand.
  const layout = portfolioLayoutFor(await primaryCategoryKind(db, userId))
  const result = computeCompleteness({
    hasDisplayName:
      Boolean(profile.quickStartCompletedAt) ||
      (profile.displayName.trim().length > 0 &&
        profile.displayName !== "New talent"),
    hasCity: Boolean(profile.cityId),
    hasBio: Boolean(profile.bio?.trim()),
    photoCount: await countTalentPhotos(db, userId),
    skillCount: skillRows.length,
    visibleSectionTypes: [...layout],
    hasShowreelMedia: Boolean(profile.showreelMediaId),
    contentCounts: {
      credits: await countRows(db, schema.credits, userId),
      languages: await countRows(db, schema.talentLanguages, userId),
      rates: await countRows(db, schema.talentRates, userId),
      availabilityMonths: availabilityMonths?.n ?? 0,
      standardAttributes: standardAttributes?.n ?? 0,
    },
    categoryCount: await countRows(db, schema.talentCategories, userId),
  })

  // A cached score: written only when it moves, and never as an edit (no timestamps). Opening the
  // studio recomputes it, so an unconditional write here would make every visit look like activity.
  if (Number(profile.completenessScore) !== result.score) {
    await db
      .update(schema.talentProfiles)
      .set({ completenessScore: String(result.score) })
      .where(eq(schema.talentProfiles.userId, userId))
    // Quality reads completeness, so a live talent's ranking follows the edit.
    if (profile.status === "live") await runQualityScoreJob(db, userId)
    await runSearchScoresJob(db, userId)
  }

  return result
}

/** The owner's editable rows and the choices for each editor. */
async function loadEditor(
  db: Db,
  profile: { willingToTravel: boolean; openToRelocate: boolean },
  userId: string
) {
  const credits = await db
    .select()
    .from(schema.credits)
    .where(eq(schema.credits.talentId, userId))
    .orderBy(asc(schema.credits.sort), sql`${schema.credits.year} desc nulls last`)

  const skills = await db
    .select({ skillId: schema.talentSkills.skillId, proficiency: schema.talentSkills.proficiency })
    .from(schema.talentSkills)
    .where(eq(schema.talentSkills.talentId, userId))

  const languages = await db
    .select({ languageId: schema.talentLanguages.languageId, fluency: schema.talentLanguages.fluency })
    .from(schema.talentLanguages)
    .where(eq(schema.talentLanguages.talentId, userId))

  const accents = await db
    .select({ accentId: schema.talentAccents.accentId })
    .from(schema.talentAccents)
    .where(eq(schema.talentAccents.talentId, userId))

  const attributes = await db
    .select()
    .from(schema.talentAttributes)
    .where(eq(schema.talentAttributes.talentId, userId))

  const definitions = await db
    .select()
    .from(schema.attributeDefinitions)
    .where(eq(schema.attributeDefinitions.active, true))
    .orderBy(asc(schema.attributeDefinitions.label))

  const languageOptions = await db
    .select({ id: schema.languages.id, name: schema.languages.name, slug: schema.languages.slug })
    .from(schema.languages)
    .where(eq(schema.languages.active, true))
    .orderBy(asc(schema.languages.name))

  const accentOptions = await db
    .select({ id: schema.accents.id, name: schema.accents.name, slug: schema.accents.slug })
    .from(schema.accents)
    .where(eq(schema.accents.active, true))
    .orderBy(asc(schema.accents.name))

  return {
    willingToTravel: profile.willingToTravel,
    openToRelocate: profile.openToRelocate,
    credits: credits.map((c) => ({
      id: c.id,
      title: c.title,
      roleName: c.roleName,
      productionCompany: c.productionCompany,
      year: c.year,
      type: c.type,
      link: c.link,
      isSignature: c.isSignature,
      verified: c.verifiedAt !== null,
    })),
    skills,
    languages,
    accentIds: accents.map((a) => a.accentId),
    attributes: attributes.map((a) => ({
      definitionId: a.definitionId,
      valueText: a.valueText,
      valueNum: a.valueNum === null ? null : Number(a.valueNum),
      valueBool: a.valueBool,
      isVisible: a.isVisible,
    })),
    attributeDefinitions: definitions.flatMap((d) =>
      // `prohibited` cannot be stored (DB check); taxonomy keys have their own editors.
      d.tier === "prohibited" || isTaxonomyAttributeKey(d.key)
        ? []
        : [
            {
              id: d.id,
              key: d.key,
              label: d.label,
              dataType: d.dataType,
              tier: d.tier,
              appliesToCategoryIds: d.appliesToCategoryIds,
              options: d.options ?? null,
            },
          ]
    ),
    languageOptions,
    accentOptions,
  }
}

export async function getStudioState(db: Db, userId: string) {
  const profile = await ensureProfile(db, userId)

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

  const categories = await db
    .select({
      id: schema.categories.id,
      name: schema.categories.name,
      slug: schema.categories.slug,
      kind: schema.categories.kind,
      parentId: schema.categories.parentId,
    })
    .from(schema.categories)
    .where(eq(schema.categories.active, true))
    .orderBy(asc(schema.categories.sort), asc(schema.categories.name))

  const categoryRows = await db
    .select({ categoryId: schema.talentCategories.categoryId })
    .from(schema.talentCategories)
    .where(eq(schema.talentCategories.talentId, userId))
    .orderBy(asc(schema.talentCategories.sort))

  const completeness = await loadCompleteness(db, userId)
  // Re-read: completeness (and the jobs it may run) just wrote to the profile.
  const [fresh] = await db
    .select()
    .from(schema.talentProfiles)
    .where(eq(schema.talentProfiles.userId, userId))
    .limit(1)
  const record = await loadTalentRecord(db, fresh ?? profile, completeness.score)
  const talent = serializeTalent(record, { kind: "owner", userId }, {})

  const mediaIds = new Set(talentMediaIds(talent))
  const { leadMediaId, canvasMediaId } = talent.profile.cardConfig
  if (leadMediaId) mediaIds.add(leadMediaId)
  if (canvasMediaId) mediaIds.add(canvasMediaId)
  const media = await getMediaStatuses(db, userId, [...mediaIds])

  return {
    talent,
    completeness,
    cities,
    skills,
    categories,
    categoryIds: categoryRows.map((row) => row.categoryId),
    media,
    editor: await loadEditor(db, fresh ?? profile, userId),
  }
}

export async function updateStudioProfile(
  db: Db,
  userId: string,
  input: {
    displayName?: string
    headline?: string | null
    bio?: string
    cityId?: string | null
    willingToTravel?: boolean
    openToRelocate?: boolean
    rateVisibility?: "public" | "verified_bookers" | "hidden"
    cardConfig?: Partial<CardConfig>
  }
) {
  await ensureProfile(db, userId)
  const [current] = await db
    .select({ cardConfig: schema.talentProfiles.cardConfig })
    .from(schema.talentProfiles)
    .where(eq(schema.talentProfiles.userId, userId))
    .limit(1)

  if (input.cityId) {
    const [city] = await db
      .select({ id: schema.cities.id })
      .from(schema.cities)
      .where(and(eq(schema.cities.id, input.cityId), eq(schema.cities.active, true)))
      .limit(1)
    if (!city) throw new StudioError("Unknown city", "unknown_city")
  }

  const nextCard = cardConfigSchema.parse({
    ...cardConfigSchema.parse(current?.cardConfig ?? {}),
    ...input.cardConfig,
  })

  const patch: Partial<typeof schema.talentProfiles.$inferInsert> = {
    cardConfig: nextCard,
    updatedAt: new Date(),
    contentUpdatedAt: new Date(),
  }
  if (input.displayName !== undefined) patch.displayName = input.displayName
  if (input.headline !== undefined) patch.headline = input.headline?.trim() || null
  if (input.bio !== undefined) patch.bio = input.bio
  if (input.cityId !== undefined) patch.cityId = input.cityId
  if (input.willingToTravel !== undefined) patch.willingToTravel = input.willingToTravel
  if (input.openToRelocate !== undefined) patch.openToRelocate = input.openToRelocate
  if (input.rateVisibility !== undefined) patch.rateVisibility = input.rateVisibility

  await db
    .update(schema.talentProfiles)
    .set(patch)
    .where(eq(schema.talentProfiles.userId, userId))

  return getStudioState(db, userId)
}

/**
 * Sets or clears the deck card's canvas. The media must be the talent's own and, as far as it has
 * been measured, inside `canvasSpec`; a video still processing is checked again when served.
 */
export async function setStudioCanvas(db: Db, userId: string, mediaId: string | null) {
  await ensureProfile(db, userId)
  if (mediaId) {
    const media = (await getMediaStatuses(db, userId, [mediaId]))[mediaId]
    if (!media) throw new StudioError("Media not found", "invalid_canvas")
    if (media.status === "failed" || media.status === "quarantined") {
      throw new StudioError("That upload didn't go through", "invalid_canvas")
    }
    const problem = canvasProblem(media)
    if (problem) throw new StudioError(problem, "invalid_canvas")
  }

  const [current] = await db
    .select({ cardConfig: schema.talentProfiles.cardConfig })
    .from(schema.talentProfiles)
    .where(eq(schema.talentProfiles.userId, userId))
    .limit(1)
  const previous = cardConfigSchema.parse(current?.cardConfig ?? {})
  const cardConfig = cardConfigSchema.parse({ ...previous, canvasMediaId: mediaId })
  await db
    .update(schema.talentProfiles)
    .set({ cardConfig, updatedAt: new Date(), contentUpdatedAt: new Date() })
    .where(eq(schema.talentProfiles.userId, userId))
  // A replaced or removed canvas is deleted unless something else still uses it.
  if (previous.canvasMediaId && previous.canvasMediaId !== mediaId) {
    scheduleMediaCleanup(db, userId, [previous.canvasMediaId])
  }

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
    categoryIds?: string[]
  }
) {
  await ensureProfile(db, userId)
  if (input.categoryIds) await replaceTalentCategories(db, userId, input.categoryIds)

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
      contentUpdatedAt: new Date(),
    })
    .where(eq(schema.talentProfiles.userId, userId))

  // The first photos, Main first; they replace any the talent had.
  scheduleMediaCleanup(db, userId, await writeTalentPhotos(db, userId, input.photoMediaIds))

  return getStudioState(db, userId)
}

/**
 * Sets or clears the showreel (a video the talent owns). It shows in the Showreel slot of the
 * fixed layout; a replaced or cleared one is deleted unless something else still uses it.
 */
export async function setStudioShowreel(db: Db, userId: string, mediaId: string | null) {
  const profile = await ensureProfile(db, userId)
  if (mediaId) {
    const media = (await getMediaStatuses(db, userId, [mediaId]))[mediaId]
    if (!media || media.kind !== "video")
      throw new StudioError("Pick a video for your showreel", "invalid_showreel")
    if (media.status === "failed" || media.status === "quarantined")
      throw new StudioError("That upload didn't go through", "invalid_showreel")
  }
  await db
    .update(schema.talentProfiles)
    .set({ showreelMediaId: mediaId, updatedAt: new Date(), contentUpdatedAt: new Date() })
    .where(eq(schema.talentProfiles.userId, userId))
  if (profile.showreelMediaId && profile.showreelMediaId !== mediaId) {
    scheduleMediaCleanup(db, userId, [profile.showreelMediaId])
  }
  return getStudioState(db, userId)
}

/**
 * Replaces the talent's categories, the first as primary. Each must be an active category. The
 * `talent_search` triggers pick the change up, so role decks see it at once.
 */
async function replaceTalentCategories(db: Db, userId: string, categoryIds: string[]) {
  const known = await db
    .select({ id: schema.categories.id })
    .from(schema.categories)
    .where(and(inArray(schema.categories.id, categoryIds), eq(schema.categories.active, true)))
  if (known.length !== new Set(categoryIds).size)
    throw new StudioError("Unknown category", "unknown_category")

  await db
    .delete(schema.talentCategories)
    .where(eq(schema.talentCategories.talentId, userId))
  await db.insert(schema.talentCategories).values(
    categoryIds.map((categoryId, sort) => ({
      talentId: userId,
      categoryId,
      isPrimary: sort === 0,
      sort,
    }))
  )
}

export async function setTalentCategories(
  db: Db,
  userId: string,
  categoryIds: string[]
) {
  await ensureProfile(db, userId)
  await replaceTalentCategories(db, userId, categoryIds)
  // Categories pick the portfolio's layout, so this is a visible edit.
  return contentEdited(db, userId)
}

const publishBlockerMessage = {
  quick_start: "Finish quick start before publishing",
  category: "Pick what you do before publishing, so bookers can find you for roles",
} as const

/**
 * A booker who is not the talent and not verified: the preview shows what such a booker would
 * get, so owner-only fields, hidden sections and verified-only rates stay out. No row has this id.
 */
const PREVIEW_VIEWER_ID = "00000000-0000-4000-8000-000000000000"

/** The talent's own deck card exactly as a booker receives it, for the studio preview. */
export async function previewDeckCard(db: Db, userId: string) {
  // Recompute first, so the card reflects the latest edits.
  await getStudioState(db, userId)
  const [profile] = await db
    .select()
    .from(schema.talentProfiles)
    .where(eq(schema.talentProfiles.userId, userId))
    .limit(1)
  if (!profile) throw new StudioError("Profile not found", "talent_not_found")
  return deckCard(db, PREVIEW_VIEWER_ID, profile)
}

export async function publishTalent(db: Db, userId: string) {
  const profile = await ensureProfile(db, userId)
  if (profile.status === "suspended") {
    throw new StudioError("This profile is suspended", "profile_suspended")
  }

  const state = await getStudioState(db, userId)
  const [blocker] = state.completeness.publishBlockers
  if (blocker) {
    throw new StudioError(publishBlockerMessage[blocker], "publish_not_ready")
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
