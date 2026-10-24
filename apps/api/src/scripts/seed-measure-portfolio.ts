/**
 * M2 task 2.10 fixture: gives an existing talent a 12-section portfolio built from their own
 * ready media (one HLS video + photos), so the device measurement runs against the same shape
 * every time.
 *
 *   pnpm --filter api seed:measure -- <email> [--replace]
 *
 * The talent must have signed in once (profile exists) and uploaded at least one photo and one
 * video that reached `ready`. Existing sections are only replaced with --replace.
 */
import { schema } from "@workspace/db"
import {
  currentSchemaVersion,
  validatePortfolioSectionWrite,
  type CoreSectionType,
} from "@workspace/schema"
import { and, desc, eq, isNotNull } from "drizzle-orm"

import { db } from "../db.js"

const GALLERY_SIZE = 6

const args = process.argv.slice(2).filter((arg) => arg !== "--")
const email = args.find((arg) => !arg.startsWith("--"))
const replace = args.includes("--replace")

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

if (!email) fail("Usage: pnpm --filter api seed:measure -- <email> [--replace]")

const [user] = await db
  .select({ id: schema.users.id })
  .from(schema.users)
  .where(eq(schema.users.email, email.toLowerCase()))
  .limit(1)
if (!user) fail(`No user with email ${email}. Sign in on the app once first.`)

const [profile] = await db
  .select({ userId: schema.talentProfiles.userId })
  .from(schema.talentProfiles)
  .where(eq(schema.talentProfiles.userId, user.id))
  .limit(1)
if (!profile)
  fail(
    "This user has no talent profile yet. Open the studio on the app once first."
  )

async function readyMedia(kind: "image" | "video") {
  const rows = await db
    .select({ id: schema.mediaAssets.id })
    .from(schema.mediaAssets)
    .where(
      and(
        eq(schema.mediaAssets.ownerId, user!.id),
        eq(schema.mediaAssets.kind, kind),
        eq(schema.mediaAssets.status, "ready"),
        // Placeholder photos from quick-start have no provider ref, so no URL to load.
        isNotNull(schema.mediaAssets.providerRef)
      )
    )
    .orderBy(desc(schema.mediaAssets.createdAt))
  return rows.map((row) => row.id)
}

const images = await readyMedia("image")
const [video] = await readyMedia("video")
if (images.length === 0 || !video) {
  fail(
    `Need at least 1 ready photo and 1 ready video (found ${images.length} photos, ${video ? 1 : 0} videos). ` +
      "Upload them in the studio and wait for processing."
  )
}

/** `count` distinct images starting at `offset`, wrapping around the available set. */
function pickImages(offset: number, count: number) {
  const n = Math.min(count, images.length)
  return Array.from(
    { length: n },
    (_, i) => images[(offset + i) % images.length]!
  )
}

const sections: { type: CoreSectionType; config: Record<string, unknown> }[] = [
  {
    type: "hero",
    config: {
      style: "full_bleed",
      mediaId: images[0],
      headline: "Actor & voice artist",
      subtitle: "Lagos · Available for travel",
      showBadges: true,
    },
  },
  {
    type: "about",
    config: {
      body:
        "Stage-trained actor with ten years across film, television and theatre. Comfortable in " +
        "Yoruba, English and Pidgin, with a strong comedic range and stunt experience.",
      mediaId: pickImages(1, 1)[0],
    },
  },
  { type: "showreel", config: { mediaId: video, headline: "2025 showreel" } },
  {
    type: "gallery",
    config: { mediaIds: pickImages(2, GALLERY_SIZE), layout: "grid" },
  },
  { type: "credits", config: { signatureOnly: false } },
  { type: "skills", config: {} },
  { type: "languages", config: { showAccents: true } },
  { type: "attributes", config: { showHidden: false } },
  {
    type: "gallery",
    config: {
      mediaIds: pickImages(2 + GALLERY_SIZE, GALLERY_SIZE),
      layout: "grid",
    },
  },
  { type: "rates", config: { showCurrency: true } },
  { type: "availability", config: { horizonMonths: 3 } },
  {
    type: "about",
    config: {
      body:
        "Recent work includes a lead role in a Nollywood feature, two national TV commercials and " +
        "a touring stage production. Open to long-form series and international co-productions.",
      mediaId: pickImages(3, 1)[0],
    },
  },
]

const rows = sections.map((section, position) => {
  const schemaVersion = currentSchemaVersion(section.type)
  validatePortfolioSectionWrite(section.type, schemaVersion, section.config)
  return {
    talentId: user.id,
    type: section.type,
    position,
    isVisible: true,
    schemaVersion,
    config: section.config,
  }
})

const existing = await db
  .select({ id: schema.portfolioSections.id })
  .from(schema.portfolioSections)
  .where(eq(schema.portfolioSections.talentId, user.id))
if (existing.length > 0 && !replace) {
  fail(
    `This talent already has ${existing.length} sections. Re-run with --replace to overwrite them.`
  )
}

await db.transaction(async (tx) => {
  await tx
    .delete(schema.portfolioSections)
    .where(eq(schema.portfolioSections.talentId, user.id))
  await tx.insert(schema.portfolioSections).values(rows)
})

console.log(
  `Seeded ${rows.length} visible sections for ${email}: 1 video, ${images.length} distinct photos.`
)
if (images.length < 12) {
  console.warn(
    `Only ${images.length} distinct photos, so galleries repeat images and cached repeats load ` +
      "faster than they would for a real profile. Upload 12+ photos for a representative run."
  )
}
process.exit(0)
