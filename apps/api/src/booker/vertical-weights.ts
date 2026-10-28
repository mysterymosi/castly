import type { VerticalCategoryWeights } from "@workspace/core"
import type { Db } from "@workspace/db"
import { schema } from "@workspace/db"
import {
  bookerVerticalLabels,
  bookerVerticals,
  type BookerVertical,
  type updateVerticalWeightInput,
  type VerticalWeightsState,
} from "@workspace/schema"
import { asc, eq } from "drizzle-orm"
import type { z } from "zod"

import { BookerError } from "./errors.js"

/**
 * The cold-start mapping for one vertical, as the deck scorer consumes it (`verticalCategoryMatch`
 * in `packages/core`). Read from the table on every call: an ops edit is what the next deck uses.
 */
export async function loadVerticalCategoryWeights(
  db: Db,
  vertical: BookerVertical,
): Promise<VerticalCategoryWeights> {
  const rows = await db
    .select({
      categoryId: schema.verticalCategoryWeights.categoryId,
      weight: schema.verticalCategoryWeights.weight,
    })
    .from(schema.verticalCategoryWeights)
    .where(eq(schema.verticalCategoryWeights.bookerVertical, vertical))
  return Object.fromEntries(rows.map((row) => [row.categoryId, Number(row.weight)]))
}

export async function listVerticalWeights(db: Db): Promise<VerticalWeightsState> {
  const categories = await db
    .select({
      id: schema.categories.id,
      slug: schema.categories.slug,
      name: schema.categories.name,
      active: schema.categories.active,
    })
    .from(schema.categories)
    .orderBy(asc(schema.categories.sort), asc(schema.categories.name))
  const weights = await db
    .select()
    .from(schema.verticalCategoryWeights)
    .orderBy(
      asc(schema.verticalCategoryWeights.bookerVertical),
      asc(schema.verticalCategoryWeights.categoryId),
    )
  return {
    verticals: bookerVerticals.map((value) => ({ value, label: bookerVerticalLabels[value] })),
    categories,
    weights: weights.map((row) => ({
      vertical: row.bookerVertical,
      categoryId: row.categoryId,
      weight: Number(row.weight),
      updatedBy: row.updatedBy,
      updatedAt: row.updatedAt.toISOString(),
    })),
  }
}

/** Upserts one (vertical, category) weight and records which admin changed it. */
export async function setVerticalWeight(
  db: Db,
  adminId: string,
  input: z.output<typeof updateVerticalWeightInput>,
): Promise<VerticalWeightsState> {
  const [category] = await db
    .select({ id: schema.categories.id })
    .from(schema.categories)
    .where(eq(schema.categories.id, input.categoryId))
    .limit(1)
  if (!category) throw new BookerError("Unknown category", "unknown_category")

  const values = { weight: String(input.weight), updatedBy: adminId, updatedAt: new Date() }
  await db
    .insert(schema.verticalCategoryWeights)
    .values({ bookerVertical: input.vertical, categoryId: input.categoryId, ...values })
    .onConflictDoUpdate({
      target: [
        schema.verticalCategoryWeights.bookerVertical,
        schema.verticalCategoryWeights.categoryId,
      ],
      set: values,
    })
  return listVerticalWeights(db)
}
