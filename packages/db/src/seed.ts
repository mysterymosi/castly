import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import { databaseUrl } from "./env.js"
import { launchAttributeDefinitions } from "./seed-attributes.js"
import {
  accents,
  attributeDefinitions,
  categories,
  cities,
  languages,
  skills,
  verticalCategoryWeights,
} from "./schema/index.js"

const launchCategories = [
  { slug: "actors", name: "Actors", kind: "on_camera" as const, sort: 1 },
  { slug: "models", name: "Models", kind: "on_camera" as const, sort: 2 },
  { slug: "dancers", name: "Dancers", kind: "on_camera" as const, sort: 3 },
  { slug: "makeup-and-hair", name: "Makeup & hair", kind: "crew" as const, sort: 4 },
  {
    slug: "photographers-cinematographers",
    name: "Photographers & cinematographers",
    kind: "crew" as const,
    sort: 5,
  },
]

const launchSkills = [
  { slug: "stage-combat", name: "Stage combat" },
  { slug: "runway", name: "Runway" },
  { slug: "contemporary-dance", name: "Contemporary dance" },
  { slug: "bridal-makeup", name: "Bridal makeup" },
  { slug: "cinematography", name: "Cinematography" },
]

const launchLanguages = [
  { slug: "english", name: "English" },
  { slug: "yoruba", name: "Yoruba" },
  { slug: "igbo", name: "Igbo" },
  { slug: "hausa", name: "Hausa" },
  { slug: "nigerian-pidgin", name: "Nigerian Pidgin" },
]

const launchAccents = [
  { slug: "neutral", name: "Neutral" },
  { slug: "yoruba", name: "Yoruba" },
  { slug: "igbo", name: "Igbo" },
  { slug: "hausa", name: "Hausa" },
  { slug: "nigerian-pidgin", name: "Nigerian Pidgin" },
  { slug: "british", name: "British" },
  { slug: "american", name: "American" },
]

const launchCities = [
  { slug: "lagos", name: "Lagos", country: "NG", region: "south-west" },
  { slug: "abuja", name: "Abuja", country: "NG", region: "north-central" },
]

/**
 * PRD §6.2 / §7.2.3 cold-start leanings, mapped onto the launch categories. Presenters, stylists,
 * MCs, DJs, and hype men have no category yet: ops add their weights when those categories land.
 * "director" leans music-video (dancers, models, stylists ≈ makeup & hair). "other" has no rows,
 * so it gets a vertical-neutral deck. Insert-only: re-seeding never overwrites an ops edit.
 */
const launchVerticalWeights: Record<
  (typeof verticalCategoryWeights.$inferInsert)["bookerVertical"],
  Record<string, number>
> = {
  casting_director: { actors: 1, models: 0.7 },
  producer: { actors: 1, models: 0.6, "makeup-and-hair": 0.4, "photographers-cinematographers": 0.4 },
  director: { dancers: 1, models: 0.8, actors: 0.7, "makeup-and-hair": 0.5 },
  brand_or_agency: { models: 1, actors: 0.7, "photographers-cinematographers": 0.5, "makeup-and-hair": 0.4 },
  event_planner: { dancers: 1, models: 0.6 },
  photographer: { models: 1, "makeup-and-hair": 0.7, actors: 0.4 },
  content_creator: { actors: 0.8, dancers: 0.8, models: 0.6 },
  other: {},
}

const connection = postgres(databaseUrl(), { max: 1 })
const db = drizzle(connection)

await db.insert(categories).values(launchCategories).onConflictDoNothing({ target: categories.slug })
await db.insert(skills).values(launchSkills).onConflictDoNothing({ target: skills.slug })
await db.insert(languages).values(launchLanguages).onConflictDoNothing({ target: languages.slug })
await db.insert(accents).values(launchAccents).onConflictDoNothing({ target: accents.slug })
await db.insert(cities).values(launchCities).onConflictDoNothing({ target: cities.slug })

const rows = await db.select({ id: categories.id, slug: categories.slug }).from(categories)
const idBySlug = new Map(rows.map((row) => [row.slug, row.id]))
const onCamera = ["actors", "models", "dancers"].map((slug) => {
  const id = idBySlug.get(slug)
  if (!id) throw new Error(`Missing launch category ${slug}`)
  return id
})
const allCategories = launchCategories.map((category) => {
  const id = idBySlug.get(category.slug)
  if (!id) throw new Error(`Missing launch category ${category.slug}`)
  return id
})

await db
  .insert(attributeDefinitions)
  .values(
    launchAttributeDefinitions.map(({ appliesTo, ...definition }) => ({
      ...definition,
      appliesToCategoryIds: appliesTo === "on_camera" ? onCamera : allCategories,
    })),
  )
  .onConflictDoNothing({ target: attributeDefinitions.key })

await db
  .insert(verticalCategoryWeights)
  .values(
    Object.entries(launchVerticalWeights).flatMap(([vertical, weights]) =>
      Object.entries(weights).map(([slug, weight]) => {
        const categoryId = idBySlug.get(slug)
        if (!categoryId) throw new Error(`Missing launch category ${slug}`)
        return {
          bookerVertical: vertical as keyof typeof launchVerticalWeights,
          categoryId,
          weight: String(weight),
        }
      }),
    ),
  )
  .onConflictDoNothing()

console.log(`Seeded ${launchCategories.length} launch categories, reference taxonomy, and vertical weights.`)
await connection.end()
