/**
 * M5 task 5.1 fixture: twelve live demo talents for the deck shell — on-camera (actors, models,
 * dancers) and crew (photographers, makeup & hair) — so the card, its gestures, and the crew
 * "opens mid-portfolio" state can be tried on a device before the ranked deck exists.
 *
 *   pnpm --filter api seed:deck -- <donor-email> [more-donor-emails…]
 *
 * Donors are accounts with ready uploaded photos and, ideally, a ready video; photos are pooled
 * across donors and the newest video is used. Each demo talent gets its own copies of those media
 * rows, pointing at the same stored files, so cards load real images and HLS. Re-running replaces the previous demo talents. Local / dev only.
 */
import { randomUUID } from "node:crypto"

import { LOCAL_DATABASE_URL, schema } from "@workspace/db"
import {
  currentSchemaVersion,
  validatePortfolioSectionWrite,
  type CoreSectionType,
} from "@workspace/schema"
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm"
import postgres from "postgres"

import { db } from "../db.js"

const DEMO_EMAIL_DOMAIN = "deck-demo.castly.invalid"

const args = process.argv.slice(2).filter((arg) => arg !== "--")
const donorEmails = args.filter((arg) => !arg.startsWith("--")).map((e) => e.toLowerCase())

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

if (donorEmails.length === 0) fail("Usage: pnpm --filter api seed:deck -- <donor-email> [more…]")

// auth.users is outside the API role's reach; demo accounts are created with the admin URL.
const admin = postgres(process.env.DATABASE_URL ?? LOCAL_DATABASE_URL, { max: 1, onnotice: () => {} })

const donors = await db
  .select({ id: schema.users.id, email: schema.users.email })
  .from(schema.users)
  .where(inArray(schema.users.email, donorEmails))
const missing = donorEmails.filter((e) => !donors.some((d) => d.email === e))
if (missing.length > 0) fail(`No user with email ${missing.join(", ")}.`)

const donorMedia = await db
  .select()
  .from(schema.mediaAssets)
  .where(
    and(
      inArray(
        schema.mediaAssets.ownerId,
        donors.map((d) => d.id),
      ),
      eq(schema.mediaAssets.status, "ready"),
      // Quick-start placeholders have no provider ref, so nothing to load.
      isNotNull(schema.mediaAssets.providerRef),
      inArray(schema.mediaAssets.kind, ["image", "video"]),
    ),
  )
  .orderBy(desc(schema.mediaAssets.createdAt))
const donorImages = donorMedia.filter((m) => m.kind === "image")
const donorVideo = donorMedia.find((m) => m.kind === "video")
if (donorImages.length === 0) fail("The donors need at least one ready uploaded photo between them.")

const categoryRows = await db
  .select({ id: schema.categories.id, slug: schema.categories.slug })
  .from(schema.categories)
const categoryId = (slug: string) => {
  const id = categoryRows.find((c) => c.slug === slug)?.id
  if (!id) fail(`Missing category "${slug}". Run pnpm db:seed first.`)
  return id
}
const cityRows = await db.select({ id: schema.cities.id, slug: schema.cities.slug }).from(schema.cities)
const ageDefinitions = await db
  .select({ id: schema.attributeDefinitions.id, key: schema.attributeDefinitions.key })
  .from(schema.attributeDefinitions)
  .where(inArray(schema.attributeDefinitions.key, ["playing_age_min", "playing_age_max"]))
const skillRows = await db.select({ id: schema.skills.id }).from(schema.skills).limit(3)

type Demo = {
  name: string
  headline: string
  category: string
  city: "lagos" | "abuja"
  facts: string[]
  age?: [number, number]
  credits: { title: string; roleName: string; year: number; type: string }[]
}

const crew = new Set(["photographers-cinematographers", "makeup-and-hair"])

const demos: Demo[] = [
  { name: "Adaeze Okafor", headline: "Actor · Lagos", category: "actors", city: "lagos", age: [24, 32], facts: ["Speaks fluent Igbo", "3 Netflix credits", "Trained: Lufodo Academy"], credits: [{ title: "Lagos Nights", roleName: "Lead", year: 2025, type: "Film" }, { title: "Bank of Hope", roleName: "Mother", year: 2024, type: "Commercial" }] },
  { name: "Tunde Bakare", headline: "Actor & stunt performer", category: "actors", city: "lagos", age: [28, 38], facts: ["Stage combat certified", "Yoruba & Pidgin", "Own transport"], credits: [{ title: "Eko Rising", roleName: "Detective Ayo", year: 2025, type: "Series" }] },
  { name: "Halima Sule", headline: "Actor · Abuja", category: "actors", city: "abuja", age: [20, 27], facts: ["Fluent Hausa", "Theatre lead, 2024", "Available weekends"], credits: [{ title: "Sahel Wind", roleName: "Amina", year: 2024, type: "Film" }] },
  { name: "Kemi Adeyemi", headline: "Commercial & runway model", category: "models", city: "lagos", age: [21, 28], facts: ["Lagos Fashion Week 2025", "Height 178 cm", "Comfortable on camera"], credits: [{ title: "Glow Skincare", roleName: "Lead model", year: 2025, type: "Campaign" }] },
  { name: "Chidi Nwosu", headline: "Fitness model", category: "models", city: "lagos", age: [25, 33], facts: ["Athletic build", "Sportswear campaigns", "Fast turnarounds"], credits: [{ title: "Run Lagos", roleName: "Hero", year: 2024, type: "Campaign" }] },
  { name: "Zainab Bello", headline: "Afrobeats dancer", category: "dancers", city: "lagos", age: [19, 26], facts: ["12 music videos", "Choreographer too", "Amapiano & Afro"], credits: [{ title: "Gbedu (Official Video)", roleName: "Lead dancer", year: 2025, type: "Music video" }, { title: "Owo", roleName: "Dancer", year: 2024, type: "Music video" }] },
  { name: "Emeka Obi", headline: "Contemporary dancer", category: "dancers", city: "abuja", age: [22, 30], facts: ["Trained in Ghana & Lagos", "Stage & screen", "Tours"], credits: [{ title: "Rhythm of Arewa", roleName: "Soloist", year: 2024, type: "Theatre" }] },
  { name: "Ngozi Eze", headline: "Actor · voice artist", category: "actors", city: "lagos", age: [30, 40], facts: ["Radio voice 10 years", "Neutral & Igbo accents", "Home studio"], credits: [{ title: "Market Day", roleName: "Narrator", year: 2023, type: "Film" }] },
  { name: "Bisi Alade", headline: "Cinematographer · DP", category: "photographers-cinematographers", city: "lagos", facts: ["Owns ARRI Alexa Mini", "Music videos & ads", "Colour grades in-house"], credits: [{ title: "Gbedu (Official Video)", roleName: "Director of photography", year: 2025, type: "Music video" }, { title: "Glow Skincare", roleName: "DP", year: 2025, type: "Campaign" }] },
  { name: "Femi Ojo", headline: "Photographer", category: "photographers-cinematographers", city: "abuja", facts: ["Editorial & campaign", "Studio in Wuse", "48h delivery"], credits: [{ title: "Arewa Style", roleName: "Photographer", year: 2024, type: "Campaign" }] },
  { name: "Ifeoma Chukwu", headline: "Makeup artist · SFX", category: "makeup-and-hair", city: "lagos", facts: ["SFX & prosthetics", "Film sets since 2018", "Team of 3"], credits: [{ title: "Lagos Nights", roleName: "Key makeup", year: 2025, type: "Film" }] },
  { name: "Aisha Musa", headline: "Hair stylist", category: "makeup-and-hair", city: "abuja", facts: ["Braids & wig installs", "Bridal & editorial", "Travels"], credits: [{ title: "Sahel Wind", roleName: "Hair", year: 2024, type: "Film" }] },
]

// Replace any previous run: deleting the users cascades to profiles, media rows, and sections.
const previous = await admin<{ id: string }[]>`
  select id from public.users where email like ${`%@${DEMO_EMAIL_DOMAIN}`}
`
if (previous.length > 0) {
  const ids = previous.map((row) => row.id)
  await admin`delete from public.users where id in ${admin(ids)}`
  await admin`delete from auth.users where id in ${admin(ids)}`
}

for (const [index, demo] of demos.entries()) {
  const userId = randomUUID()
  const email = `demo-${String(index + 1).padStart(2, "0")}@${DEMO_EMAIL_DOMAIN}`
  await admin`
    insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', ${userId}, 'authenticated', 'authenticated', ${email},
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
  `
  await admin`
    insert into public.users (id, email, date_of_birth, status) values (${userId}, ${email}, '1995-01-01', 'active')
  `
  await db.insert(schema.userModes).values({ userId, mode: "talent" })

  // Own copies of the donor's media rows (same stored files), rotated so cards differ.
  const rotation = (n: number) => donorImages[(index + n) % donorImages.length]!
  const imageIds: string[] = []
  for (let n = 0; n < Math.min(6, donorImages.length); n++) {
    const source = rotation(n)
    const [row] = await db
      .insert(schema.mediaAssets)
      .values({ ...source, id: randomUUID(), ownerId: userId, createdAt: new Date(), updatedAt: new Date() })
      .returning({ id: schema.mediaAssets.id })
    imageIds.push(row!.id)
  }
  let videoId: string | null = null
  if (donorVideo) {
    const [row] = await db
      .insert(schema.mediaAssets)
      .values({ ...donorVideo, id: randomUUID(), ownerId: userId, createdAt: new Date(), updatedAt: new Date() })
      .returning({ id: schema.mediaAssets.id })
    videoId = row!.id
  }

  const isCrew = crew.has(demo.category)
  const cityId = cityRows.find((c) => c.slug === demo.city)?.id ?? null
  await db.insert(schema.talentProfiles).values({
    userId,
    slug: `demo-${demo.name.toLowerCase().replace(/[^a-z]+/g, "-")}`,
    displayName: demo.name,
    headline: demo.headline,
    bio: `${demo.headline}. Demo talent for the deck shell.`,
    cityId,
    status: "live",
    publishedAt: new Date(Date.now() - index * 60_000),
    quickStartCompletedAt: new Date(),
    completenessScore: "80",
    qualityScore: "60",
    cardConfig: { leadMediaId: imageIds[0] ?? null, highlightFacts: demo.facts },
  })
  await db
    .insert(schema.talentCategories)
    .values({ talentId: userId, categoryId: categoryId(demo.category), isPrimary: true })
  await db.insert(schema.credits).values(
    demo.credits.map((credit, sort) => ({ talentId: userId, ...credit, isSignature: sort === 0, sort })),
  )
  if (skillRows.length > 0) {
    await db.insert(schema.talentSkills).values(skillRows.map((s) => ({ talentId: userId, skillId: s.id })))
  }
  if (demo.age) {
    for (const definition of ageDefinitions) {
      const value = definition.key === "playing_age_min" ? demo.age[0] : demo.age[1]
      await db
        .insert(schema.talentAttributes)
        .values({ talentId: userId, definitionId: definition.id, valueNum: String(value) })
    }
  }

  const gallery = { type: "gallery" as const, config: { mediaIds: imageIds.slice(1), layout: "grid" } }
  const showreel = videoId
    ? [{ type: "showreel" as const, config: { mediaId: videoId, headline: isCrew ? "Recent work" : "2025 showreel" } }]
    : []
  // Crew portfolios lead with work samples and credits; on-camera with the hero shot.
  const sections: { type: CoreSectionType; config: Record<string, unknown> }[] = isCrew
    ? [
        gallery,
        ...showreel,
        { type: "credits", config: { signatureOnly: false } },
        { type: "about", config: { body: `${demo.headline} based in ${demo.city === "lagos" ? "Lagos" : "Abuja"}.` } },
        { type: "skills", config: {} },
      ]
    : [
        { type: "hero", config: { style: "full_bleed", mediaId: imageIds[0] ?? null, headline: demo.headline, showBadges: false } },
        { type: "about", config: { body: `${demo.headline}. ${demo.facts.join(". ")}.` } },
        ...showreel,
        gallery,
        { type: "credits", config: { signatureOnly: false } },
        { type: "skills", config: {} },
      ]
  await db.insert(schema.portfolioSections).values(
    sections.map((section, position) => {
      const schemaVersion = currentSchemaVersion(section.type)
      const valid = validatePortfolioSectionWrite(section.type, schemaVersion, section.config)
      return { talentId: userId, type: section.type, position, isVisible: true, schemaVersion, config: valid.config }
    }),
  )
  console.log(`${isCrew ? "crew     " : "on-camera"}  ${demo.name}`)
}

console.log(
  `Seeded ${demos.length} live demo talents from ${donorImages.length} photo(s)` +
    `${donorVideo ? " and 1 video" : " (no ready video: showreels skipped)"}.`,
)
await admin.end()
process.exit(0)
