import { sql } from "drizzle-orm"
import { check, index, jsonb, pgEnum, pgTable, uniqueIndex, uuid } from "drizzle-orm/pg-core"

import { bookerProfiles, roles } from "./booker.js"
import { primaryUuid, timestamptz } from "./columns.js"
import { talentProfiles } from "./talent.js"

export const interestStatus = pgEnum("interest_status", ["pending", "accepted", "declined", "expired"])

/**
 * A booker's right-swipe, sent to the talent (TECH_SPEC §5.7). `pending` until the talent accepts
 * or declines, or `expires_at` passes; auto-accept answers it in the swipe's own transaction.
 *
 * `role_id` is SET NULL, not CASCADE: deleting a role must never take an accepted interest, its
 * match and the chat behind it along. Two pending interests collapsing onto a NULL role would
 * collide with `interests_pending_uidx` and fail the delete — the safe way for it to fail.
 */
export const interests = pgTable(
  "interests",
  {
    id: primaryUuid(),
    bookerId: uuid("booker_id")
      .notNull()
      .references(() => bookerProfiles.userId, { onDelete: "cascade" }),
    talentId: uuid("talent_id")
      .notNull()
      .references(() => talentProfiles.userId, { onDelete: "cascade" }),
    roleId: uuid("role_id").references(() => roles.id, { onDelete: "set null" }),
    status: interestStatus("status").notNull().default("pending"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    /** When the talent accepted or declined (auto-accept included). Null while pending or expired. */
    respondedAt: timestamptz("responded_at"),
    expiresAt: timestamptz("expires_at").notNull(),
  },
  (table) => [
    // One open interest per booker, talent and role; a role-less one counts as its own "role".
    uniqueIndex("interests_pending_uidx")
      .on(
        table.bookerId,
        table.talentId,
        sql`coalesce(${table.roleId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      )
      .where(sql`${table.status} = 'pending'`),
    // The talent's incoming list.
    index("interests_talent_status_created_idx").on(table.talentId, table.status, table.createdAt.desc()),
    index("interests_booker_id_idx").on(table.bookerId),
    index("interests_role_id_idx").on(table.roleId),
    // The expiry job reads only what is still pending.
    index("interests_pending_expires_idx").on(table.expiresAt).where(sql`${table.status} = 'pending'`),
    check("interests_not_self", sql`${table.bookerId} <> ${table.talentId}`),
    check("interests_expires_after_created", sql`${table.expiresAt} > ${table.createdAt}`),
    check(
      "interests_responded_at_matches",
      sql`(${table.status} IN ('accepted', 'declined')) = (${table.respondedAt} IS NOT NULL)`,
    ),
  ],
)

/**
 * What a talent is shown when a booker attaches a role's brief to a match (M6 6.4). A copy taken
 * at attach time, not a live link: the talent sees what was offered even if the role is edited
 * later. Deliberately not `roles.requirements` — that holds sensitive-tier attributes (PRD
 * §7.3.1) that never go to a talent. `packages/schema` `matchBriefSchema` is the contract.
 */
export type MatchBrief = {
  roleId: string
  roleName: string
  projectName: string
  projectType: string | null
  brief: string
  shootStartsOn: string | null
  shootEndsOn: string | null
  rateMin: number | null
  rateMax: number | null
  rateCurrency: string
}

/**
 * Mutual interest: the talent accepted (or had auto-accept on). One per interest. Chat hangs off
 * this row (`conversations.match_id`, M6 6.2), which is how "no conversation without a match" is
 * enforced by foreign key.
 *
 * `interest_id` is NO ACTION: nothing deletes an accepted interest, and a user's deletion removes
 * both rows in one statement, which NO ACTION (unlike RESTRICT) allows.
 */
export const matches = pgTable(
  "matches",
  {
    id: primaryUuid(),
    interestId: uuid("interest_id")
      .notNull()
      .references(() => interests.id),
    bookerId: uuid("booker_id")
      .notNull()
      .references(() => bookerProfiles.userId, { onDelete: "cascade" }),
    talentId: uuid("talent_id")
      .notNull()
      .references(() => talentProfiles.userId, { onDelete: "cascade" }),
    roleId: uuid("role_id").references(() => roles.id, { onDelete: "set null" }),
    /** The brief the booker attached, if any (`brief` and `brief_attached_at` are set together). */
    brief: jsonb("brief").$type<MatchBrief>(),
    briefAttachedAt: timestamptz("brief_attached_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "matches_brief_attached_together",
      sql`(${table.brief} IS NULL) = (${table.briefAttachedAt} IS NULL)
        AND (${table.brief} IS NULL OR jsonb_typeof(${table.brief}) = 'object')`,
    ),
    uniqueIndex("matches_interest_id_uidx").on(table.interestId),
    index("matches_booker_created_idx").on(table.bookerId, table.createdAt.desc()),
    index("matches_talent_created_idx").on(table.talentId, table.createdAt.desc()),
    index("matches_role_id_idx").on(table.roleId),
  ],
)
