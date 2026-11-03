import { serializeTalent } from "@workspace/core"
import type { Db } from "@workspace/db"
import { schema } from "@workspace/db"
import type { CoreSectionConfigMap, DeckCard, DeckDecision } from "@workspace/schema"
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm"

import { getMediaStatuses } from "../media/service.js"
import { loadTalentRecord, sectionMediaIds } from "../talent/record.js"

const LEAD_MEDIA_MAX = 5

export type Card = Omit<DeckCard, "talent"> & {
  talent: ReturnType<typeof serializeTalent>
}

/** Primary category (falls back to the first listed) with its kind. */
async function primaryCategory(db: Db, talentId: string) {
  const [row] = await db
    .select({ name: schema.categories.name, kind: schema.categories.kind })
    .from(schema.talentCategories)
    .innerJoin(schema.categories, eq(schema.talentCategories.categoryId, schema.categories.id))
    .where(eq(schema.talentCategories.talentId, talentId))
    .orderBy(desc(schema.talentCategories.isPrimary), asc(schema.talentCategories.sort))
    .limit(1)
  return row ?? null
}

/** Age range playable, from the visible `playing_age_min` / `playing_age_max` attributes. */
async function playingAge(db: Db, talentId: string): Promise<DeckDecision["ageRange"]> {
  const rows = await db
    .select({ key: schema.attributeDefinitions.key, value: schema.talentAttributes.valueNum })
    .from(schema.talentAttributes)
    .innerJoin(
      schema.attributeDefinitions,
      eq(schema.talentAttributes.definitionId, schema.attributeDefinitions.id),
    )
    .where(
      and(
        eq(schema.talentAttributes.talentId, talentId),
        eq(schema.talentAttributes.isVisible, true),
        inArray(schema.attributeDefinitions.key, ["playing_age_min", "playing_age_max"]),
      ),
    )
  const value = (key: string) => {
    const raw = rows.find((r) => r.key === key)?.value
    return raw == null ? null : Number(raw)
  }
  const min = value("playing_age_min")
  const max = value("playing_age_max")
  return min === null && max === null ? null : { min, max }
}

/**
 * One talent as a deck card, for `viewerId` (a booker). Serialized with the same rules as every
 * other talent payload; the booker is unverified until M7, so verified-only rates stay hidden.
 */
export async function deckCard(
  db: Db,
  viewerId: string,
  profile: typeof schema.talentProfiles.$inferSelect,
): Promise<Card> {
  const record = await loadTalentRecord(db, profile, Number(profile.completenessScore))
  const talent = serializeTalent(record, { kind: "user", userId: viewerId, verifiedBooker: false }, {})

  // Decision-layer media: card lead, then hero and gallery photos, in that order.
  const sections = talent.sections
  const configs = <T extends keyof CoreSectionConfigMap>(type: T) =>
    sections.filter((s) => s.type === type).map((s) => s.config as CoreSectionConfigMap[T])
  const leadCandidates = [
    talent.profile.cardConfig.leadMediaId,
    ...configs("hero").map((c) => c.mediaId),
    ...configs("gallery").flatMap((c) => c.mediaIds),
  ].filter((id): id is string => Boolean(id))

  const ids = new Set([...sectionMediaIds(sections), ...leadCandidates])
  const statuses = await getMediaStatuses(db, profile.userId, [...ids])
  const media = Object.fromEntries(Object.entries(statuses).filter(([, m]) => m.status === "ready"))

  const leadMediaIds = [...new Set(leadCandidates)]
    .filter((id) => media[id]?.kind === "image" || media[id]?.posterUrl)
    .slice(0, LEAD_MEDIA_MAX)

  const category = await primaryCategory(db, profile.userId)
  const credits = talent.content.credits
  const signature = credits.find((c) => c.isSignature) ?? credits[0] ?? null

  return {
    talent,
    media,
    decision: {
      categoryName: category?.name ?? null,
      categoryKind: category?.kind ?? null,
      ageRange: category?.kind === "on_camera" || !category ? await playingAge(db, profile.userId) : null,
      leadMediaIds,
      creditCount: credits.length,
      signatureCredit: signature
        ? { title: signature.title, roleName: signature.roleName, year: signature.year }
        : null,
    },
  }
}

/**
 * Interim deck: live talents, newest first, excluding the booker's own talent profile. No ranking,
 * fairness, or queue — `deck.start` / `deck.next` (M5 5.4–5.8) replace this with the same card
 * shape. Loads each card separately; fine for a 20-card preview, not for the real deck.
 */
export async function previewDeck(db: Db, bookerId: string, limit: number) {
  const profiles = await db
    .select()
    .from(schema.talentProfiles)
    .where(and(eq(schema.talentProfiles.status, "live"), ne(schema.talentProfiles.userId, bookerId)))
    .orderBy(desc(schema.talentProfiles.publishedAt))
    .limit(limit)
  const cards: Card[] = []
  for (const profile of profiles) cards.push(await deckCard(db, bookerId, profile))
  return { cards }
}
