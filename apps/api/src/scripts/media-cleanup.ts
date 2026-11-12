/**
 * Deletes media nothing uses that is older than the grace period (24 hours): uploads that were
 * never attached, and anything a background cleanup could not reach. Provider file first, then
 * the row; a provider failure is logged and that media kept for the next run.
 *
 *   pnpm --filter api media:cleanup            # delete
 *   pnpm --filter api media:cleanup --dry-run  # only count
 */
import { schema } from "@workspace/db"
import { lt } from "drizzle-orm"

import { db } from "../db.js"
import { sweepUnusedMedia, UNATTACHED_GRACE_MS } from "../media/cleanup.js"

const dryRun = process.argv.includes("--dry-run")

if (dryRun) {
  const old = await db
    .select({ id: schema.mediaAssets.id })
    .from(schema.mediaAssets)
    .where(lt(schema.mediaAssets.createdAt, new Date(Date.now() - UNATTACHED_GRACE_MS)))
  const kept: string[] = []
  const deleted = await sweepUnusedMedia(db, {
    batch: old.length || 1,
    // Dry run: report what would go, delete nothing.
    deleteFileOverride: async (id) => {
      kept.push(id)
      throw new Error("dry run")
    },
  })
  console.log(`Dry run: ${kept.length} unused media older than 24h would be deleted (${deleted.length} deleted).`)
} else {
  let total = 0
  for (;;) {
    const deleted = await sweepUnusedMedia(db)
    total += deleted.length
    if (deleted.length === 0) break
  }
  console.log(`Deleted ${total} unused media.`)
}
process.exit(0)
