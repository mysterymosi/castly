import type { Db } from "@workspace/db"
import { schema } from "@workspace/db"
import type {
  BookerProfileState,
  BookerVertical,
  ProjectType,
  updateBookerProfileInput,
} from "@workspace/schema"
import { and, asc, eq, sql } from "drizzle-orm"
import type { z } from "zod"

import { BookerError } from "./errors.js"

// The schema package's enum lists must match the database enums exactly, in both directions.
type DbVertical = (typeof schema.bookerVertical.enumValues)[number]
type DbProjectType = (typeof schema.projectType.enumValues)[number]
const _sameVerticals = (v: DbVertical): BookerVertical => v
const _sameVerticalsBack = (v: BookerVertical): DbVertical => v
const _sameTypes = (t: DbProjectType): ProjectType => t
const _sameTypesBack = (t: ProjectType): DbProjectType => t
void [_sameVerticals, _sameVerticalsBack, _sameTypes, _sameTypesBack]

async function activeCities(db: Db) {
  return db
    .select({ id: schema.cities.id, name: schema.cities.name, slug: schema.cities.slug })
    .from(schema.cities)
    .where(eq(schema.cities.active, true))
    .orderBy(asc(schema.cities.name))
}

async function loadProfile(db: Db, userId: string) {
  const [row] = await db
    .select({
      profile: schema.bookerProfiles,
      cityName: schema.cities.name,
    })
    .from(schema.bookerProfiles)
    .leftJoin(schema.cities, eq(schema.bookerProfiles.cityId, schema.cities.id))
    .where(eq(schema.bookerProfiles.userId, userId))
    .limit(1)
  if (!row) return null
  const { profile } = row
  return {
    userId: profile.userId,
    vertical: profile.vertical,
    companyName: profile.companyName,
    cityId: profile.cityId,
    cityName: row.cityName,
    typicalProjectTypes: profile.typicalProjectTypes,
    verificationTier: profile.verificationTier,
    verificationRequestedAt: profile.verificationRequestedAt?.toISOString() ?? null,
  }
}

/** The booker's profile (null until setup is finished) and the cities the setup offers. */
export async function getBookerProfileState(db: Db, userId: string): Promise<BookerProfileState> {
  return {
    profile: await loadProfile(db, userId),
    cities: await activeCities(db),
  }
}

/** Creates or replaces the profile. `cac_number` and the verification fields are not touched. */
export async function updateBookerProfile(
  db: Db,
  userId: string,
  input: z.output<typeof updateBookerProfileInput>,
): Promise<BookerProfileState> {
  const [city] = await db
    .select({ id: schema.cities.id })
    .from(schema.cities)
    .where(and(eq(schema.cities.id, input.cityId), eq(schema.cities.active, true)))
    .limit(1)
  if (!city) throw new BookerError("Choose a city from the list", "unknown_city")

  const values = {
    vertical: input.vertical,
    companyName: input.companyName,
    cityId: input.cityId,
    typicalProjectTypes: input.typicalProjectTypes,
  }
  await db
    .insert(schema.bookerProfiles)
    .values({ userId, ...values })
    .onConflictDoUpdate({
      target: schema.bookerProfiles.userId,
      set: { ...values, updatedAt: new Date() },
    })

  return getBookerProfileState(db, userId)
}

/**
 * Stub until M7: records that the booker asked to be verified. Idempotent — the first request
 * time is kept. The review flow and `verifications` rows are M7.
 */
export async function submitBookerVerification(
  db: Db,
  userId: string,
): Promise<BookerProfileState> {
  const updated = await db
    .update(schema.bookerProfiles)
    .set({
      verificationRequestedAt: sql`coalesce(${schema.bookerProfiles.verificationRequestedAt}, now())`,
      updatedAt: new Date(),
    })
    .where(eq(schema.bookerProfiles.userId, userId))
    .returning({ userId: schema.bookerProfiles.userId })
  if (updated.length === 0) {
    throw new BookerError("Finish your booker profile first", "profile_required")
  }
  return getBookerProfileState(db, userId)
}
