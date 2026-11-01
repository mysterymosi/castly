import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { bookerProfiles, roles, shortlists } from "./booker.js"
import { primaryUuid, timestamptz } from "./columns.js"
import { users } from "./identity.js"
import { talentProfiles } from "./talent.js"

export const swipeDirection = pgEnum("swipe_direction", ["pass", "interest", "save"])

export const swipeSource = pgEnum("swipe_source", ["deck", "open_role", "search"])

/**
 * One "why this card" entry, appended by scoring (TECH_SPEC §7.2); `DeckReason` in
 * `packages/core` is the source. `detail` names what matched, never attribute values.
 */
export type DeckReason = {
  code: string
  contribution: number
  detail?: Record<string, string | readonly string[]>
}

/**
 * One deck run for a booker, optionally for a role (TECH_SPEC §5.6). `seed` makes the session's
 * random choices (stage 1 tiebreak, stage 3 exploration) repeatable, so a deck can be replayed.
 */
export const deckSessions = pgTable(
  "deck_sessions",
  {
    id: primaryUuid(),
    bookerId: uuid("booker_id")
      .notNull()
      .references(() => bookerProfiles.userId, { onDelete: "cascade" }),
    // SET NULL: the session (and its impressions) outlive a deleted role.
    roleId: uuid("role_id").references(() => roles.id, { onDelete: "set null" }),
    goalCount: integer("goal_count"),
    seed: integer("seed").notNull(),
    /** The booker's filter object (`deckFiltersSchema`), kept so a refill re-runs the same stage 1. */
    filters: jsonb("filters").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    startedAt: timestamptz("started_at").notNull().defaultNow(),
    endedAt: timestamptz("ended_at"),
  },
  (table) => [
    index("deck_sessions_booker_started_idx").on(table.bookerId, table.startedAt.desc()),
    index("deck_sessions_role_id_idx").on(table.roleId),
    check("deck_sessions_filters_object", sql`jsonb_typeof(${table.filters}) = 'object'`),
    check("deck_sessions_goal_count_positive", sql`${table.goalCount} IS NULL OR ${table.goalCount} > 0`),
    check(
      "deck_sessions_ended_after_start",
      sql`${table.endedAt} IS NULL OR ${table.endedAt} >= ${table.startedAt}`,
    ),
  ],
)

/**
 * The session's ranked deck, materialised (TECH_SPEC §7.4) so paging stays stable while scores
 * move. `deck.next` reads forward from the first unserved position.
 */
export const deckQueue = pgTable(
  "deck_queue",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => deckSessions.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    talentId: uuid("talent_id")
      .notNull()
      .references(() => talentProfiles.userId, { onDelete: "cascade" }),
    score: numeric("score", { precision: 10, scale: 4 }).notNull(),
    reasons: jsonb("reasons").$type<DeckReason[]>().notNull().default(sql`'[]'::jsonb`),
    servedAt: timestamptz("served_at"),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.position] }),
    unique("deck_queue_session_talent_key").on(table.sessionId, table.talentId),
    index("deck_queue_talent_id_idx").on(table.talentId),
    check("deck_queue_position_nonnegative", sql`${table.position} >= 0`),
    check("deck_queue_reasons_array", sql`jsonb_typeof(${table.reasons}) = 'array'`),
  ],
)

/**
 * Every deck decision. Passes are role-scoped and decay after 30 days (stage 1); an undone swipe
 * keeps its row with `undone_at` set. A deck swipe names its session and queue position, so undo
 * can step back to the card; `shortlist_id` / `entry_added` record what it put on a shortlist,
 * so undo removes only an entry this swipe created.
 */
export const swipes = pgTable(
  "swipes",
  {
    id: primaryUuid(),
    bookerId: uuid("booker_id")
      .notNull()
      .references(() => bookerProfiles.userId, { onDelete: "cascade" }),
    talentId: uuid("talent_id")
      .notNull()
      .references(() => talentProfiles.userId, { onDelete: "cascade" }),
    roleId: uuid("role_id").references(() => roles.id, { onDelete: "cascade" }),
    direction: swipeDirection("direction").notNull(),
    source: swipeSource("source").notNull().default("deck"),
    sessionId: uuid("session_id").references(() => deckSessions.id, { onDelete: "set null" }),
    position: integer("position"),
    shortlistId: uuid("shortlist_id").references(() => shortlists.id, { onDelete: "set null" }),
    entryAdded: boolean("entry_added").notNull().default(false),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    undoneAt: timestamptz("undone_at"),
  },
  (table) => [
    // One live decision per card in a session; an undone swipe frees the card for another.
    uniqueIndex("swipes_session_position_live_uidx")
      .on(table.sessionId, table.position)
      .where(sql`${table.sessionId} IS NOT NULL AND ${table.undoneAt} IS NULL`),
    // The partial index above can't serve the session foreign key; this one can.
    index("swipes_session_id_idx").on(table.sessionId),
    index("swipes_shortlist_id_idx").on(table.shortlistId),
    check("swipes_session_has_position", sql`${table.sessionId} IS NULL OR ${table.position} IS NOT NULL`),
    // Stage 1's decay check and undo: a booker's recent swipes, per role.
    index("swipes_booker_role_created_idx").on(table.bookerId, table.roleId, table.createdAt.desc()),
    index("swipes_talent_id_idx").on(table.talentId),
    index("swipes_role_id_idx").on(table.roleId),
  ],
)

/** A card shown in a session, with how far the booker scrolled it and how long they stayed. */
export const deckImpressions = pgTable(
  "deck_impressions",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => deckSessions.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    talentId: uuid("talent_id")
      .notNull()
      .references(() => talentProfiles.userId, { onDelete: "cascade" }),
    shownAt: timestamptz("shown_at").notNull().defaultNow(),
    /** Fraction of the portfolio scrolled, 0–1. */
    maxScrollDepth: numeric("max_scroll_depth", { precision: 4, scale: 3 }),
    dwellMs: integer("dwell_ms"),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.position] }),
    // The nightly exposure roll-up reads a day of impressions per talent.
    index("deck_impressions_talent_shown_idx").on(table.talentId, table.shownAt),
    check(
      "deck_impressions_scroll_depth_range",
      sql`${table.maxScrollDepth} IS NULL OR (${table.maxScrollDepth} >= 0 AND ${table.maxScrollDepth} <= 1)`,
    ),
    check("deck_impressions_dwell_nonnegative", sql`${table.dwellMs} IS NULL OR ${table.dwellMs} >= 0`),
  ],
)

/** Impressions and interests per talent per day, rolled up nightly; backs the exposure penalty. */
export const talentExposureDaily = pgTable(
  "talent_exposure_daily",
  {
    talentId: uuid("talent_id")
      .notNull()
      .references(() => talentProfiles.userId, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    impressions: integer("impressions").notNull().default(0),
    interests: integer("interests").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.talentId, table.day] }),
    // Stage 3 ranks every talent's last-7-days impressions.
    index("talent_exposure_daily_day_idx").on(table.day),
    check(
      "talent_exposure_daily_counts_nonnegative",
      sql`${table.impressions} >= 0 AND ${table.interests} >= 0`,
    ),
  ],
)

/** A signed-in viewer opening a talent's portfolio outside the deck. */
export const profileViews = pgTable(
  "profile_views",
  {
    id: primaryUuid(),
    talentId: uuid("talent_id")
      .notNull()
      .references(() => talentProfiles.userId, { onDelete: "cascade" }),
    viewerId: uuid("viewer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    at: timestamptz("at").notNull().defaultNow(),
  },
  (table) => [
    index("profile_views_talent_at_idx").on(table.talentId, table.at.desc()),
    index("profile_views_viewer_id_idx").on(table.viewerId),
  ],
)
