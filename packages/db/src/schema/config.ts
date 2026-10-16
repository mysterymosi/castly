import { index, jsonb, numeric, pgTable, text, uuid } from "drizzle-orm/pg-core"

import { timestamptz } from "./columns.js"
import { users } from "./identity.js"

/** Empty until ops sets flags. A table so later milestones do not fork the schema. */
export const featureFlags = pgTable("feature_flags", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  description: text("description"),
})

/** Empty until ops tunes the deck. Values are data, not constants. */
export const rankingWeights = pgTable(
  "ranking_weights",
  {
    key: text("key").primaryKey(),
    value: numeric("value").notNull(),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [index("ranking_weights_updated_by_idx").on(table.updatedBy)],
)
