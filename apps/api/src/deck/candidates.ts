import {
  checkAttributeFilters,
  type AttributeValue,
  type DeckCandidate,
  type FilterAttributeTier,
  type ScoringContext,
  type ScoringRequirement,
} from "@workspace/core"
import type { Db } from "@workspace/db"
import { schema } from "@workspace/db"
import type { DeckFilters, RoleRequirements } from "@workspace/schema"
import {
  and,
  arrayOverlaps,
  desc,
  eq,
  exists,
  gt,
  gte,
  inArray,
  isNull,
  lte,
  ne,
  not,
  or,
  sql,
  type SQL,
} from "drizzle-orm"

import { BookerError } from "../booker/errors.js"
import { loadVerticalCategoryWeights } from "../booker/vertical-weights.js"
import { ProjectError } from "../project/errors.js"
import { DeckError } from "./errors.js"

/** Stage 1's cap (TECH_SPEC §7.1): enough for a session plus refills, small enough for one query. */
export const CANDIDATE_LIMIT = 500

/** A swipe hides the talent from the same booker and role for this long (TECH_SPEC §7.2.2). */
export const SWIPE_DECAY_DAYS = 30

/** The API pool or a transaction: stage 1 only reads. */
export type Reader = Pick<Db, "select">

/** Everything stage 1 needs, resolved once per session; refills (5.8) resolve it again. */
export type CandidateScope = {
  bookerId: string
  roleId: string | null
  seed: number
  /** The booker's country (from their city); talents elsewhere are out of scope. */
  country: string | null
  /**
   * Category sets a talent must overlap, each expanded to its child categories: the role's
   * category, the booker's category filter, or — when neither names one — the vertical's
   * preferred categories. Empty means no category restriction.
   */
  categorySets: string[][]
  filters: DeckFilters
  /**
   * Stage 2's inputs other than the weights: the vertical's category weights, where the booker
   * is, and the role's requirements with their tiers. A briefed role's sensitive filters join
   * the requirements here as soft weights; they never reach SQL.
   */
  scoring: Omit<ScoringContext, "weights">
}

/** `ids` plus their direct children: a parent category stands for its subcategories. */
async function withChildCategories(db: Reader, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return []
  const children = await db
    .select({ id: schema.categories.id })
    .from(schema.categories)
    .where(inArray(schema.categories.parentId, ids))
  return [...new Set([...ids, ...children.map((row) => row.id)])]
}

async function attributeTiers(db: Reader, keys: string[]) {
  if (keys.length === 0) return {}
  const rows = await db
    .select({ key: schema.attributeDefinitions.key, tier: schema.attributeDefinitions.tier })
    .from(schema.attributeDefinitions)
    .where(
      and(
        inArray(schema.attributeDefinitions.key, keys),
        eq(schema.attributeDefinitions.active, true),
      ),
    )
  return Object.fromEntries(
    rows.map((row) => [row.key, row.tier as FilterAttributeTier]),
  ) as Record<string, FilterAttributeTier>
}

/**
 * Resolves the booker, role and filters into a stage 1 scope, and runs the sensitive-attribute
 * guard before anything reaches SQL. Throws `profile_required` without a booker profile and
 * `role_not_found` for a role that isn't the booker's.
 */
export async function resolveCandidateScope(
  db: Reader,
  bookerId: string,
  roleId: string | null,
  filters: DeckFilters,
  seed: number,
): Promise<CandidateScope> {
  const [booker] = await db
    .select({
      vertical: schema.bookerProfiles.vertical,
      cityId: schema.bookerProfiles.cityId,
      region: schema.cities.region,
      country: schema.cities.country,
    })
    .from(schema.bookerProfiles)
    .leftJoin(schema.cities, eq(schema.bookerProfiles.cityId, schema.cities.id))
    .where(eq(schema.bookerProfiles.userId, bookerId))
    .limit(1)
  if (!booker) throw new BookerError("Finish your booker profile first", "profile_required")

  let role: { categoryId: string | null; brief: string | null; requirements: RoleRequirements } | null =
    null
  if (roleId) {
    const [owned] = await db
      .select({
        categoryId: schema.roles.categoryId,
        brief: schema.roles.brief,
        requirements: schema.roles.requirements,
      })
      .from(schema.roles)
      .innerJoin(schema.projects, eq(schema.roles.projectId, schema.projects.id))
      .where(and(eq(schema.roles.id, roleId), eq(schema.projects.bookerId, bookerId)))
      .limit(1)
    if (!owned) throw new ProjectError("Role not found", "role_not_found")
    role = { ...owned, requirements: owned.requirements as RoleRequirements }
  }

  const attributes = filters.attributes ?? {}
  const keys = Object.keys(attributes)
  const tiers = await attributeTiers(db, [...keys, ...Object.keys(role?.requirements ?? {})])
  const check = checkAttributeFilters(
    keys,
    Object.fromEntries(keys.filter((key) => tiers[key]).map((key) => [key, tiers[key]!])),
    role,
  )
  if (!check.ok) {
    const list = check.keys.map((key) => `"${key}"`).join(", ")
    throw check.reason === "unknown_attribute"
      ? new DeckError(`Unknown attribute ${list}`, "unknown_attribute")
      : new DeckError(
          `${list} can only be used on a role with a written brief`,
          "sensitive_requires_brief",
        )
  }
  // Standard attributes are hard filters on `talent_search`'s attribute projection, which M8
  // fills; until then a filter on one would silently match nobody.
  if (check.standard.length > 0) {
    throw new DeckError(
      `${check.standard.map((key) => `"${key}"`).join(", ")} can't be filtered on yet`,
      "attribute_filter_unavailable",
    )
  }

  const verticalWeights = await loadVerticalCategoryWeights(db, booker.vertical)
  const categorySets: string[][] = []
  if (role?.categoryId) categorySets.push(await withChildCategories(db, [role.categoryId]))
  if (filters.categoryIds) categorySets.push(await withChildCategories(db, filters.categoryIds))
  if (categorySets.length === 0) {
    const preferred = Object.keys(verticalWeights).filter((id) => verticalWeights[id]! > 0)
    if (preferred.length > 0) categorySets.push(await withChildCategories(db, preferred))
  }

  // The role's requirements, then its sensitive filters (which win on the same key). A
  // requirement whose definition has since been retired has no tier and drops out.
  const requirements: RoleRequirements = {
    ...role?.requirements,
    ...Object.fromEntries(check.sensitive.map((key) => [key, attributes[key]!])),
  }
  const scoringRequirements: ScoringRequirement[] = Object.entries(requirements).flatMap(
    ([key, requirement]) => (tiers[key] ? [{ key, tier: tiers[key]!, requirement }] : []),
  )

  return {
    bookerId,
    roleId,
    seed,
    country: booker.country,
    categorySets,
    filters,
    scoring: {
      verticalWeights,
      booker: { cityId: booker.cityId, region: booker.region, country: booker.country },
      role: role
        ? { briefed: Boolean(role.brief?.trim()), requirements: scoringRequirements }
        : null,
    },
  }
}

/**
 * Stage 1 (TECH_SPEC §7.1) as one query over `talent_search`: the hard filters, best quality
 * first, ties broken by a session-seeded hash so two bookers in one vertical get different decks.
 * Returned unawaited so the measurement script can `EXPLAIN ANALYZE` the exact query.
 */
export function candidateQuery(db: Reader, scope: CandidateScope) {
  const ts = schema.talentSearch
  const swipes = schema.swipes
  const blocks = schema.blocks
  const f = scope.filters

  const recentSwipe = db
    .select({ one: sql`1` })
    .from(swipes)
    .where(
      and(
        eq(swipes.bookerId, scope.bookerId),
        scope.roleId ? eq(swipes.roleId, scope.roleId) : isNull(swipes.roleId),
        eq(swipes.talentId, ts.talentId),
        isNull(swipes.undoneAt),
        gt(swipes.createdAt, sql`now() - make_interval(days => ${SWIPE_DECAY_DAYS})`),
      ),
    )
  // Two anti-joins rather than one OR, so each direction is an index lookup.
  const blockedByBooker = db
    .select({ one: sql`1` })
    .from(blocks)
    .where(and(eq(blocks.blockerId, scope.bookerId), eq(blocks.blockedId, ts.talentId)))
  const blockedBooker = db
    .select({ one: sql`1` })
    .from(blocks)
    .where(and(eq(blocks.blockerId, ts.talentId), eq(blocks.blockedId, scope.bookerId)))

  const conditions: (SQL | undefined)[] = [
    eq(ts.status, "live"),
    ne(ts.talentId, scope.bookerId),
    scope.country ? eq(ts.country, scope.country) : undefined,
    ...scope.categorySets.map((ids) => arrayOverlaps(ts.categoryIds, ids)),
    f.cityIds ? inArray(ts.cityId, f.cityIds) : undefined,
    f.regions ? inArray(ts.region, f.regions) : undefined,
    f.skillIds ? arrayOverlaps(ts.skillIds, f.skillIds) : undefined,
    f.languageIds ? arrayOverlaps(ts.languageIds, f.languageIds) : undefined,
    f.accentIds ? arrayOverlaps(ts.accentIds, f.accentIds) : undefined,
    // A hidden or unset rate has no `rate_day_min`; it stays in (PRD §7.3).
    f.rateDayMax !== undefined
      ? or(isNull(ts.rateDayMin), lte(ts.rateDayMin, String(f.rateDayMax)))
      : undefined,
    f.hasShowreel ? eq(ts.hasShowreel, true) : undefined,
    f.minCredits !== undefined ? gte(ts.creditCount, f.minCredits) : undefined,
    not(exists(recentSwipe)),
    not(exists(blockedByBooker)),
    not(exists(blockedBooker)),
  ]

  return db
    .select({
      talentId: ts.talentId,
      categoryIds: ts.categoryIds,
      cityId: ts.cityId,
      region: ts.region,
      country: ts.country,
      qualityScore: ts.qualityScore,
      freshnessScore: ts.freshnessScore,
      responsivenessScore: ts.responsivenessScore,
      languageIds: ts.languageIds,
      accentIds: ts.accentIds,
    })
    .from(ts)
    .where(and(...conditions))
    .orderBy(desc(ts.qualityScore), sql`md5(${ts.talentId}::text || ${String(scope.seed)})`)
    .limit(CANDIDATE_LIMIT)
}

/** Slug by id for a taxonomy-backed attribute, which role requirements name by slug. */
async function taxonomySlugs(db: Reader, key: "languages" | "accents") {
  const table = key === "languages" ? schema.languages : schema.accents
  const rows = await db.select({ id: table.id, slug: table.slug }).from(table)
  return new Map(rows.map((row) => [row.id, row.slug]))
}

/**
 * Runs stage 1 and shapes each row for scoring. Attributes are what role matching reads, and
 * only the ones the role asks about: languages and accents from the projection's id lists.
 * Other attributes read as unknown until M8 projects them onto `talent_search`.
 */
export async function generateCandidates(db: Reader, scope: CandidateScope): Promise<DeckCandidate[]> {
  const rows = await candidateQuery(db, scope)
  const asked = new Set((scope.scoring.role?.requirements ?? []).map((r) => r.key))
  const slugs = {
    languages: asked.has("languages") ? await taxonomySlugs(db, "languages") : null,
    accents: asked.has("accents") ? await taxonomySlugs(db, "accents") : null,
  }
  return rows.map(({ languageIds, accentIds, ...row }) => {
    const attributes: Record<string, AttributeValue> = {}
    for (const [key, ids] of [
      ["languages", languageIds],
      ["accents", accentIds],
    ] as const) {
      const map = slugs[key]
      if (map && ids.length > 0) {
        attributes[key] = ids.flatMap((id) => map.get(id) ?? [])
      }
    }
    return {
      ...row,
      qualityScore: Number(row.qualityScore),
      freshnessScore: Number(row.freshnessScore),
      responsivenessScore: Number(row.responsivenessScore),
      attributes,
      // Raise a hand (M9) and boosts (M10) feed these; until then they never add to a score.
      raisedHand: false,
      boost: 0,
    }
  })
}
