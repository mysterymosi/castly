import { index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core"

import { primaryUuid, timestamptz } from "./columns.js"
import { mediaAssets } from "./talent.js"

/** Single-use upload credential for a pending `media_assets` row. */
export const mediaUploadTokens = pgTable(
  "media_upload_tokens",
  {
    id: primaryUuid(),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
    secretHash: text("secret_hash").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    consumedAt: timestamptz("consumed_at"),
  },
  (table) => [
    uniqueIndex("media_upload_tokens_media_id_uidx").on(table.mediaId),
    index("media_upload_tokens_expires_at_idx").on(table.expiresAt),
  ],
)

/** M2.5 stub queue — M7 replaces the processor with Hive / Sightengine via pg-boss. */
export const mediaModerationJobs = pgTable(
  "media_moderation_jobs",
  {
    id: primaryUuid(),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    processedAt: timestamptz("processed_at"),
  },
  (table) => [
    uniqueIndex("media_moderation_jobs_media_id_uidx").on(table.mediaId),
    index("media_moderation_jobs_status_idx").on(table.status),
  ],
)
