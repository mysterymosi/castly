import { date, index, pgEnum, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core"

import { primaryUuid, timestamptz } from "./columns.js"

export const userStatus = pgEnum("user_status", ["active", "suspended", "deleted"])
export const userMode = pgEnum("user_mode", ["talent", "booker", "admin"])
export const devicePlatform = pgEnum("device_platform", ["ios", "android"])

/** Mirrors `auth.users.id`. No default — the id is assigned by Supabase Auth. */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    phone: text("phone"),
    email: text("email"),
    dateOfBirth: date("date_of_birth", { mode: "string" }),
    status: userStatus("status").notNull().default("active"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    lastActiveAt: timestamptz("last_active_at"),
  },
  (table) => [
    uniqueIndex("users_phone_uidx").on(table.phone),
    uniqueIndex("users_email_uidx").on(table.email),
  ],
)

export const userModes = pgTable(
  "user_modes",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mode: userMode("mode").notNull(),
    enabledAt: timestamptz("enabled_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.mode] })],
)

export const deviceTokens = pgTable(
  "device_tokens",
  {
    id: primaryUuid(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: devicePlatform("platform").notNull(),
    token: text("token").notNull(),
    lastSeenAt: timestamptz("last_seen_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("device_tokens_token_uidx").on(table.token),
    index("device_tokens_user_id_idx").on(table.userId),
  ],
)
