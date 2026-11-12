import type { Db } from "@workspace/db"
import { schema } from "@workspace/db"
import {
  AVAILABILITY_WINDOW_MONTHS,
  availabilityMonthKey,
  type CoreSectionType,
  isTaxonomyAttributeKey,
  validatePortfolioSectionWrite,
} from "@workspace/schema"
import { and, eq, inArray, max } from "drizzle-orm"

import { StudioError } from "./errors.js"
import { scheduleMediaCleanup } from "../media/cleanup.js"
import { appendTalentPhoto, replaceTalentPhoto, writeTalentPhotos } from "./photos.js"
import { defaultSchemaVersion, defaultSectionConfig } from "./section-defaults.js"
import { ensureProfile, getStudioState } from "./studio-service.js"

/**
 * Writes for the studio's content editors (M2b). Every write returns the fresh studio state,
 * which recomputes completeness; the `talent_search` triggers project the rows themselves.
 */

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]

/**
 * Adds the section that displays `type` when the talent has none, so the first credit (say) shows
 * on the page. An existing section, hidden or not, is left alone: hiding it was the talent's call.
 */
async function ensureSection(tx: Db | Tx, userId: string, type: CoreSectionType) {
  const rows = await tx
    .select({ type: schema.portfolioSections.type })
    .from(schema.portfolioSections)
    .where(eq(schema.portfolioSections.talentId, userId))
  if (rows.some((row) => row.type === type)) return
  const schemaVersion = defaultSchemaVersion(type)
  const config = defaultSectionConfig(type)
  validatePortfolioSectionWrite(type, schemaVersion, config)
  await tx.insert(schema.portfolioSections).values({
    talentId: userId,
    type,
    position: rows.length,
    schemaVersion,
    config,
  })
}

/** Throws unless every id is an active row of `table`. */
async function assertActive(
  db: Db,
  table: typeof schema.skills | typeof schema.languages | typeof schema.accents,
  ids: string[],
  error: StudioError
) {
  if (ids.length === 0) return
  const known = await db
    .select({ id: table.id })
    .from(table)
    .where(and(inArray(table.id, ids), eq(table.active, true)))
  if (known.length !== new Set(ids).size) throw error
}

// --- Photos -------------------------------------------------------------------------------

/** Reorder or remove: the whole list, Main first. */
export async function setTalentPhotos(db: Db, userId: string, mediaIds: string[]) {
  await ensureProfile(db, userId)
  const removed = await writeTalentPhotos(db, userId, mediaIds)
  scheduleMediaCleanup(db, userId, removed)
  return getStudioState(db, userId)
}

/** A finished upload takes the next free slot. */
export async function addTalentPhoto(db: Db, userId: string, mediaId: string) {
  await ensureProfile(db, userId)
  await appendTalentPhoto(db, userId, mediaId)
  return getStudioState(db, userId)
}

/** A replacement upload takes the old photo's slot. */
export async function swapTalentPhoto(db: Db, userId: string, mediaId: string, withMediaId: string) {
  await ensureProfile(db, userId)
  scheduleMediaCleanup(db, userId, await replaceTalentPhoto(db, userId, mediaId, withMediaId))
  return getStudioState(db, userId)
}

// --- Skills -------------------------------------------------------------------------------

export async function setTalentSkills(
  db: Db,
  userId: string,
  skillIds: string[],
  proficiency: Record<string, "learning" | "competent" | "proficient" | "expert"> = {}
) {
  await ensureProfile(db, userId)
  await assertActive(db, schema.skills, skillIds, new StudioError("Unknown skill", "unknown_skill"))
  await db.transaction(async (tx) => {
    await tx.delete(schema.talentSkills).where(eq(schema.talentSkills.talentId, userId))
    if (skillIds.length > 0) {
      await tx.insert(schema.talentSkills).values(
        skillIds.map((skillId) => ({
          talentId: userId,
          skillId,
          ...(proficiency[skillId] ? { proficiency: proficiency[skillId] } : {}),
        }))
      )
      await ensureSection(tx, userId, "skills")
    }
  })
  return getStudioState(db, userId)
}

// --- Credits ------------------------------------------------------------------------------

type CreditFields = {
  title: string
  roleName: string | null
  productionCompany: string | null
  year: number | null
  type: string | null
  link: string | null
  isSignature: boolean
}

/** At most one signature credit: marking one unmarks the rest. */
async function clearOtherSignatures(tx: Tx, userId: string) {
  await tx
    .update(schema.credits)
    .set({ isSignature: false })
    .where(and(eq(schema.credits.talentId, userId), eq(schema.credits.isSignature, true)))
}

export async function createCredit(db: Db, userId: string, input: CreditFields) {
  await ensureProfile(db, userId)
  await db.transaction(async (tx) => {
    if (input.isSignature) await clearOtherSignatures(tx, userId)
    const [last] = await tx
      .select({ sort: max(schema.credits.sort) })
      .from(schema.credits)
      .where(eq(schema.credits.talentId, userId))
    // `verifiedAt` is never taken from input; only verification (M7) sets it.
    await tx.insert(schema.credits).values({
      talentId: userId,
      ...input,
      sort: (last?.sort ?? -1) + 1,
    })
    await ensureSection(tx, userId, "credits")
  })
  return getStudioState(db, userId)
}

async function ownedCredit(db: Db | Tx, userId: string, creditId: string) {
  const [row] = await db
    .select()
    .from(schema.credits)
    .where(and(eq(schema.credits.id, creditId), eq(schema.credits.talentId, userId)))
    .limit(1)
  if (!row) throw new StudioError("Credit not found", "credit_not_found")
  return row
}

export async function updateCredit(
  db: Db,
  userId: string,
  input: CreditFields & { creditId: string }
) {
  const { creditId, ...fields } = input
  await db.transaction(async (tx) => {
    const current = await ownedCredit(tx, userId, creditId)
    if (fields.isSignature) await clearOtherSignatures(tx, userId)
    // Editing what a verified credit says voids the verification.
    const changed =
      current.title !== fields.title ||
      current.roleName !== fields.roleName ||
      current.productionCompany !== fields.productionCompany ||
      current.year !== fields.year
    await tx
      .update(schema.credits)
      .set({ ...fields, ...(changed ? { verifiedAt: null } : {}) })
      .where(eq(schema.credits.id, creditId))
  })
  return getStudioState(db, userId)
}

export async function deleteCredit(db: Db, userId: string, creditId: string) {
  await ownedCredit(db, userId, creditId)
  await db.delete(schema.credits).where(eq(schema.credits.id, creditId))
  return getStudioState(db, userId)
}

/** `creditIds` must list every one of the talent's credits, in the new order. */
export async function reorderCredits(db: Db, userId: string, creditIds: string[]) {
  const rows = await db
    .select({ id: schema.credits.id })
    .from(schema.credits)
    .where(eq(schema.credits.talentId, userId))
  const owned = new Set(rows.map((row) => row.id))
  if (creditIds.length !== owned.size || creditIds.some((id) => !owned.has(id))) {
    throw new StudioError("List every credit once to reorder", "invalid_credit_order")
  }
  await db.transaction(async (tx) => {
    for (let sort = 0; sort < creditIds.length; sort++) {
      await tx.update(schema.credits).set({ sort }).where(eq(schema.credits.id, creditIds[sort]!))
    }
  })
  return getStudioState(db, userId)
}

// --- Languages and accents ----------------------------------------------------------------

export async function setTalentLanguages(
  db: Db,
  userId: string,
  languages: { languageId: string; fluency: "basic" | "conversational" | "fluent" | "native" }[]
) {
  await ensureProfile(db, userId)
  await assertActive(
    db,
    schema.languages,
    languages.map((l) => l.languageId),
    new StudioError("Unknown language", "unknown_language")
  )
  await db.transaction(async (tx) => {
    await tx.delete(schema.talentLanguages).where(eq(schema.talentLanguages.talentId, userId))
    if (languages.length > 0) {
      await tx
        .insert(schema.talentLanguages)
        .values(languages.map((l) => ({ talentId: userId, ...l })))
      await ensureSection(tx, userId, "languages")
    }
  })
  return getStudioState(db, userId)
}

export async function setTalentAccents(db: Db, userId: string, accentIds: string[]) {
  await ensureProfile(db, userId)
  await assertActive(db, schema.accents, accentIds, new StudioError("Unknown accent", "unknown_accent"))
  await db.transaction(async (tx) => {
    await tx.delete(schema.talentAccents).where(eq(schema.talentAccents.talentId, userId))
    if (accentIds.length > 0) {
      await tx
        .insert(schema.talentAccents)
        .values(accentIds.map((accentId) => ({ talentId: userId, accentId })))
      await ensureSection(tx, userId, "languages")
    }
  })
  return getStudioState(db, userId)
}

// --- Rates --------------------------------------------------------------------------------

export async function setTalentRates(
  db: Db,
  userId: string,
  rates: {
    kind: "day" | "half_day" | "project"
    amountMin: number | null
    amountMax: number | null
    currency: string
    negotiable: boolean
  }[]
) {
  await ensureProfile(db, userId)
  await db.transaction(async (tx) => {
    await tx.delete(schema.talentRates).where(eq(schema.talentRates.talentId, userId))
    if (rates.length > 0) {
      await tx.insert(schema.talentRates).values(
        rates.map((rate) => ({
          talentId: userId,
          kind: rate.kind,
          amountMin: rate.amountMin === null ? null : String(rate.amountMin),
          amountMax: rate.amountMax === null ? null : String(rate.amountMax),
          currency: rate.currency,
          negotiable: rate.negotiable,
        }))
      )
      await ensureSection(tx, userId, "rates")
    }
  })
  return getStudioState(db, userId)
}

// --- Availability -------------------------------------------------------------------------

/**
 * Replaces the talent's availability. Months must fall in the editor's window (this month and the
 * next 11); everything stored before is deleted, so past months drop off on every write.
 */
export async function setTalentAvailability(
  db: Db,
  userId: string,
  months: { month: string; status: "available" | "partial" | "booked" }[],
  now = new Date()
) {
  await ensureProfile(db, userId)
  const first = availabilityMonthKey(now)
  const last = availabilityMonthKey(now, AVAILABILITY_WINDOW_MONTHS - 1)
  const outside = months.find((m) => m.month < first || m.month > last)
  if (outside) {
    throw new StudioError(
      outside.month < first
        ? `${outside.month} has already passed`
        : `Availability only goes ${AVAILABILITY_WINDOW_MONTHS} months ahead`,
      "invalid_availability"
    )
  }
  await db.transaction(async (tx) => {
    await tx.delete(schema.talentAvailability).where(eq(schema.talentAvailability.talentId, userId))
    if (months.length > 0) {
      await tx
        .insert(schema.talentAvailability)
        .values(months.map((m) => ({ talentId: userId, ...m })))
      await ensureSection(tx, userId, "availability")
    }
  })
  return getStudioState(db, userId)
}

// --- Attributes ---------------------------------------------------------------------------

type AttributeInput = {
  definitionKey: string
  valueText?: string
  valueNum?: number
  valueBool?: boolean
  isVisible?: boolean
}

type Definition = typeof schema.attributeDefinitions.$inferSelect

/** The row values for `input`, checked against the definition's data type and options. */
function attributeValues(definition: Definition, input: AttributeInput) {
  const bad = (message: string) => new StudioError(message, "invalid_attribute_value")
  const { valueText, valueNum, valueBool } = input
  switch (definition.dataType) {
    case "number":
      if (valueNum === undefined || valueText !== undefined || valueBool !== undefined)
        throw bad(`${definition.label} takes a number`)
      if (valueNum < 0) throw bad(`${definition.label} can't be negative`)
      return { valueText: null, valueNum: String(valueNum), valueBool: null }
    case "boolean":
      if (valueBool === undefined || valueText !== undefined || valueNum !== undefined)
        throw bad(`${definition.label} is yes or no`)
      return { valueText: null, valueNum: null, valueBool }
    case "text":
      if (!valueText || valueNum !== undefined || valueBool !== undefined)
        throw bad(`${definition.label} takes text`)
      return { valueText, valueNum: null, valueBool: null }
    case "select":
    case "multi_select": {
      if (!valueText || valueNum !== undefined || valueBool !== undefined)
        throw bad(`Pick a ${definition.label.toLowerCase()}`)
      const picked = definition.dataType === "select" ? [valueText] : valueText.split(",")
      const options = definition.options ?? []
      if (picked.some((value) => !options.includes(value)))
        throw bad(`That isn't one of the ${definition.label.toLowerCase()} options`)
      return { valueText: picked.join(","), valueNum: null, valueBool: null }
    }
  }
}

/**
 * Sets, clears or re-shows one attribute. Sensitive values are stored for role-gated matching
 * (M8) but never displayed or scored: completeness counts standard attributes only.
 */
export async function setTalentAttribute(db: Db, userId: string, input: AttributeInput) {
  await ensureProfile(db, userId)
  const [definition] = await db
    .select()
    .from(schema.attributeDefinitions)
    .where(
      and(
        eq(schema.attributeDefinitions.key, input.definitionKey),
        eq(schema.attributeDefinitions.active, true)
      )
    )
    .limit(1)
  if (!definition) throw new StudioError("Unknown attribute", "unknown_attribute")
  // Languages and accents have their own tables; one source of truth per value.
  if (isTaxonomyAttributeKey(definition.key))
    throw new StudioError(
      `Set ${definition.label.toLowerCase()} from its own list, not as an attribute`,
      "unknown_attribute"
    )

  const key = and(
    eq(schema.talentAttributes.talentId, userId),
    eq(schema.talentAttributes.definitionId, definition.id)
  )
  const hasValue =
    input.valueText !== undefined || input.valueNum !== undefined || input.valueBool !== undefined

  if (!hasValue && input.isVisible === undefined) {
    await db.delete(schema.talentAttributes).where(key)
  } else if (!hasValue) {
    await db.update(schema.talentAttributes).set({ isVisible: input.isVisible }).where(key)
  } else {
    const values = attributeValues(definition, input)
    await db.transaction(async (tx) => {
      await tx
        .insert(schema.talentAttributes)
        .values({
          talentId: userId,
          definitionId: definition.id,
          ...values,
          ...(input.isVisible !== undefined ? { isVisible: input.isVisible } : {}),
        })
        .onConflictDoUpdate({
          target: [schema.talentAttributes.talentId, schema.talentAttributes.definitionId],
          set: { ...values, ...(input.isVisible !== undefined ? { isVisible: input.isVisible } : {}) },
        })
      // Sensitive values never display, so they never add the section either.
      if (definition.tier === "standard") await ensureSection(tx, userId, "attributes")
    })
  }

  return getStudioState(db, userId)
}
