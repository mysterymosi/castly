import { checkAttributeFilters, type DeckCandidate, type FilterAttributeTier } from "@workspace/core"
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
  /** Sensitive preferences from a briefed role's filters: stage 2 input (5.6), never SQL. */
  softAttributes: RoleRequirements
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
    .select({ vertical: schema.bookerProfiles.vertical, country: schema.cities.country })
    .from(schema.bookerProfiles)
    .leftJoin(schema.cities, eq(schema.bookerProfiles.cityId, schema.cities.id))
    .where(eq(schema.bookerProfiles.userId, bookerId))
    .limit(1)
  if (!booker) throw new BookerError("Finish your booker profile first", "profile_required")

  let role: { categoryId: string | null; brief: string | null } | null = null
  if (roleId) {
    const [owned] = await db
      .select({ categoryId: schema.roles.categoryId, brief: schema.roles.brief })
      .from(schema.roles)
      .innerJoin(schema.projects, eq(schema.roles.projectId, schema.projects.id))
      .where(and(eq(schema.roles.id, roleId), eq(schema.projects.bookerId, bookerId)))
      .limit(1)
    if (!owned) throw new ProjectError("Role not found", "role_not_found")
    role = owned
  }

  const attributes = filters.attributes ?? {}
  const keys = Object.keys(attributes)
  const check = checkAttributeFilters(keys, await attributeTiers(db, keys), role)
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

  const categorySets: string[][] = []
  if (role?.categoryId) categorySets.push(await withChildCategories(db, [role.categoryId]))
  if (filters.categoryIds) categorySets.push(await withChildCategories(db, filters.categoryIds))
  if (categorySets.length === 0) {
    const weights = await loadVerticalCategoryWeights(db, booker.vertical)
    const preferred = Object.keys(weights).filter((id) => weights[id]! > 0)
    if (preferred.length > 0) categorySets.push(await withChildCategories(db, preferred))
  }

  return {
    bookerId,
    roleId,
    seed,
    country: booker.country,
    categorySets,
    filters,
    softAttributes: Object.fromEntries(check.sensitive.map((key) => [key, attributes[key]!])),
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
      qualityScore: ts.qualityScore,
      categoryIds: ts.categoryIds,
      cityId: ts.cityId,
    })
    .from(ts)
    .where(and(...conditions))
    .orderBy(desc(ts.qualityScore), sql`md5(${ts.talentId}::text || ${String(scope.seed)})`)
    .limit(CANDIDATE_LIMIT)
}

export async function generateCandidates(db: Reader, scope: CandidateScope): Promise<DeckCandidate[]> {
  const rows = await candidateQuery(db, scope)
  return rows.map((row) => ({ ...row, qualityScore: Number(row.qualityScore) }))
}
