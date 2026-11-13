/**
 * Deletes media nothing uses that is older than the grace period (24 hours): uploads that were
 * never attached, and anything a background cleanup could not reach. Provider file first, then
 * the row; a provider failure is logged and that media kept for the next run.
 *
 *   pnpm --filter api media:cleanup            # delete
 *   pnpm --filter api media:cleanup --dry-run  # only count
 */
import { schema } from "@workspace/db"
import { count, lt } from "drizzle-orm"

import { db } from "../db.js"
import { sweepUnusedMedia, UNATTACHED_GRACE_MS } from "../media/cleanup.js"

const dryRun = process.argv.includes("--dry-run")

if (dryRun) {
  // One batch covering every row past the grace period, so the count is the full set.
  const [{ n } = { n: 0 }] = await db
    .select({ n: count() })
    .from(schema.mediaAssets)
    .where(lt(schema.mediaAssets.createdAt, new Date(Date.now() - UNATTACHED_GRACE_MS)))
  const wouldDelete = await sweepUnusedMedia(db, { batch: n || 1, dryRun: true })
  console.log(`Dry run: ${wouldDelete.length} unused media older than 24h would be deleted. Nothing was deleted.`)
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
