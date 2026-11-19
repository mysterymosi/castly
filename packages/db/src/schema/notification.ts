import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { primaryUuid, timestamptz } from "./columns.js"
import { users } from "./identity.js"

export const notificationCategory = pgEnum("notification_category", [
  "interest",
  "match",
  "message",
  "brief",
])
export const notificationCadence = pgEnum("notification_cadence", [
  "immediate",
  "weekly",
])

export const notificationPrefs = pgTable(
  "notification_prefs",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: notificationCategory("category").notNull(),
    enabled: boolean("enabled").notNull(),
    cadence: notificationCadence("cadence").notNull(),
    // Maximum pushes in a rolling 24-hour window, per category across the account's devices.
    frequencyCap: integer("frequency_cap"),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.category] }),
    check(
      "notification_prefs_frequency_cap",
      sql`${table.frequencyCap} between 1 and 1000`
    ),
    check(
      "notification_prefs_weekly_brief",
      sql`${table.cadence} <> 'weekly' or ${table.category} = 'brief'`
    ),
  ]
)

// Written with the source event. A processed row is the deduplication record.
export const pushNotifications = pgTable(
  "push_notifications",
  {
    id: primaryUuid(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: notificationCategory("category").notNull(),
    subjectId: uuid("subject_id").notNull(),
    digestAt: timestamptz("digest_at"),
    processedAt: timestamptz("processed_at"),
    queuedAt: timestamptz("queued_at"),
  },
  (table) => [
    uniqueIndex("push_notifications_event_key").on(
      table.userId,
      table.category,
      table.subjectId
    ),
    index("push_notifications_pending_idx")
      .on(table.id)
      .where(sql`${table.processedAt} is null`),
    index("push_notifications_cap_idx")
      .on(table.userId, table.category, table.queuedAt)
      .where(sql`${table.queuedAt} is not null`),
  ]
)
