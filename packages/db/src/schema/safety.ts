import { sql } from "drizzle-orm"
import { check, index, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core"

import { timestamptz } from "./columns.js"
import { users } from "./identity.js"

/**
 * One user blocking another (TECH_SPEC §5.8). A block hides each side from the other in both
 * directions; the deck applies it in stage 1 from M5, the block action itself ships in M7.
 */
export const blocks = pgTable(
  "blocks",
  {
    blockerId: uuid("blocker_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blockedId: uuid("blocked_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.blockerId, table.blockedId] }),
    // The reverse direction ("who blocked me"); the primary key covers the forward one.
    index("blocks_blocked_id_idx").on(table.blockedId),
    check("blocks_not_self", sql`${table.blockerId} <> ${table.blockedId}`),
  ],
)
