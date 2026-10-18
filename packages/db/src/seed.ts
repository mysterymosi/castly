import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import { databaseUrl } from "./env.js"
import {
  accents,
  attributeDefinitions,
  categories,
  cities,
  languages,
  skills,
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
  { slug: "lagos", name: "Lagos" },
  { slug: "abuja", name: "Abuja" },
]

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
  .values([
    {
      key: "height_cm",
      label: "Height (cm)",
      dataType: "number",
      tier: "standard",
      appliesToCategoryIds: onCamera,
    },
    {
      key: "hair",
      label: "Hair",
      dataType: "select",
      tier: "standard",
      appliesToCategoryIds: onCamera,
      options: ["black", "brown", "blonde", "coloured", "bald"],
    },
    {
      key: "experience_years",
      label: "Years of experience",
      dataType: "number",
      tier: "standard",
      appliesToCategoryIds: allCategories,
    },
    {
      key: "ethnicity",
      label: "Ethnicity",
      dataType: "select",
      tier: "sensitive",
      appliesToCategoryIds: onCamera,
      options: ["black", "white", "mixed", "other", "prefer_not_to_say"],
    },
  ])
  .onConflictDoNothing({ target: attributeDefinitions.key })

console.log(`Seeded ${launchCategories.length} launch categories and reference taxonomy.`)
await connection.end()
