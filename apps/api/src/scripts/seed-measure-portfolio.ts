/**
 * M2 task 2.10 fixture: fills an existing talent's portfolio from their own ready media (one HLS
 * video + photos) and a bio, so the device measurement runs against the same shape every time.
 * Lists (credits, languages…) come from the talent's own data or `seed:deck`.
 *
 *   pnpm --filter api seed:measure -- <email> [--replace]
 *
 * The talent must have signed in once (profile exists) and uploaded at least one photo and one
 * video that reached `ready`. An existing showreel is only replaced with --replace.
 */
import { schema } from "@workspace/db"
import { PHOTO_SLOTS } from "@workspace/schema"
import { and, desc, eq, isNotNull } from "drizzle-orm"

import { db } from "../db.js"


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

// The layout is fixed by category; this fills what it shows: bio, showreel and six photos.
const [existing] = await db
  .select({ showreelMediaId: schema.talentProfiles.showreelMediaId })
  .from(schema.talentProfiles)
  .where(eq(schema.talentProfiles.userId, user.id))
  .limit(1)
if (existing?.showreelMediaId && !replace) {
  fail("This talent already has a showreel. Re-run with --replace to overwrite their portfolio.")
}

await db.transaction(async (tx) => {
  await tx
    .update(schema.talentProfiles)
    .set({
      showreelMediaId: video,
      bio:
        "Stage-trained actor with ten years across film, television and theatre. Comfortable in " +
        "Yoruba, English and Pidgin, with a strong comedic range and stunt experience.",
    })
    .where(eq(schema.talentProfiles.userId, user.id))
  await tx.delete(schema.talentPhotos).where(eq(schema.talentPhotos.talentId, user.id))
  const photoIds = [...new Set(pickImages(0, PHOTO_SLOTS * 2))].slice(0, PHOTO_SLOTS)
  if (photoIds.length > 0) {
    await tx
      .insert(schema.talentPhotos)
      .values(photoIds.map((mediaId, position) => ({ talentId: user.id, mediaId, position })))
  }
})

console.log(`Seeded ${email}: bio, 1 showreel, ${Math.min(images.length, PHOTO_SLOTS)} photos.`)
process.exit(0)
