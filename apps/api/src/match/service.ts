import type { Db } from "@workspace/db"
import { schema } from "@workspace/db"
import type { Match, MatchBrief, matchListInput } from "@workspace/schema"
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm"
import type { z } from "zod"

import { verticalNoun } from "../interest/copy.js"
import { recordPush } from "../notification/events.js"
import { MatchError } from "./errors.js"

const { matches, conversations, conversationParticipants, messages,
  bookerProfiles, talentProfiles, roles, projects } = schema

/** What names a match on screen; shared by the inbox query and the single-match lookup. */
const summaryFields = {
  match: matches,
  conversationId: conversations.id,
  company: bookerProfiles.companyName,
  vertical: bookerProfiles.vertical,
  talentName: talentProfiles.displayName,
  projectName: projects.name,
  roleName: roles.name,
}

function matchRows(db: Db, userId: string) {
  const latest = db.select({
    id: messages.id, kind: messages.kind, body: messages.body,
    senderId: messages.senderId, createdAt: messages.createdAt,
  }).from(messages)
    .where(and(eq(messages.conversationId, conversations.id), isNull(messages.deletedAt)))
    .orderBy(desc(messages.id)).limit(1).as("latest")

  const activityId = sql<string>`coalesce(${latest.id}, ${matches.id})`
  return {
    activityId,
    query: db.select({
      ...summaryFields,
      latest: {
        id: latest.id, kind: latest.kind, body: latest.body,
        senderId: latest.senderId, createdAt: latest.createdAt,
      },
      activityId,
      // In SQL, not JavaScript: a Date keeps milliseconds, Postgres keeps microseconds, and a
      // newer message in the same millisecond as the last read would otherwise count as read.
      unread: sql<boolean>`(
        ${latest.id} is not null
        and ${latest.senderId} <> ${userId}
        and (${conversationParticipants.lastReadAt} is null
          or ${latest.createdAt} > ${conversationParticipants.lastReadAt})
      )`,
    }).from(matches)
      .innerJoin(conversations, eq(conversations.matchId, matches.id))
      .innerJoin(conversationParticipants, and(
        eq(conversationParticipants.conversationId, conversations.id),
        eq(conversationParticipants.userId, userId),
      ))
      .leftJoin(bookerProfiles, eq(bookerProfiles.userId, matches.bookerId))
      .leftJoin(talentProfiles, eq(talentProfiles.userId, matches.talentId))
      .leftJoin(roles, eq(roles.id, matches.roleId))
      .leftJoin(projects, eq(projects.id, roles.projectId))
      .leftJoinLateral(latest, sql`true`),
  }
}

type SummaryRow = {
  [K in keyof typeof summaryFields]: Awaited<ReturnType<typeof loadMatch>>[K]
}

function matchSummary(row: SummaryRow, viewer: string) {
  const viewerIsBooker = row.match.bookerId === viewer
  const bookerRole = row.vertical ? verticalNoun[row.vertical] : "booker"
  return {
    id: row.match.id,
    conversationId: row.conversationId,
    createdAt: row.match.createdAt.toISOString(),
    counterpart: {
      role: viewerIsBooker ? "talent" as const : "booker" as const,
      name: viewerIsBooker ? row.talentName || "Talent"
        : row.company || bookerRole[0]!.toUpperCase() + bookerRole.slice(1),
    },
    projectName: row.projectName,
    roleName: row.roleName,
  }
}

export async function listMatches(db: Db, userId: string, input: z.infer<typeof matchListInput>) {
  const { activityId, query } = matchRows(db, userId)
  const sortId = input.view === "chats" ? activityId : sql<string>`${matches.id}`
  const side = input.mode === "booker" ? matches.bookerId : matches.talentId
  const cursor = input.cursor
  const limit = 30
  const rows = await query.where(and(
    eq(side, userId),
    cursor ? or(lt(sortId, cursor.sortId), and(eq(sortId, cursor.sortId), lt(matches.id, cursor.matchId))) : undefined,
  )).orderBy(desc(sortId), desc(matches.id)).limit(limit + 1)

  const page = rows.slice(0, limit)
  const last = page.at(-1)
  return {
    items: page.map((row) => ({
      ...matchSummary(row, userId),
      latestMessage: row.latest ? {
        kind: row.latest.kind, body: row.latest.body, createdAt: row.latest.createdAt.toISOString(),
      } : null,
      unread: row.unread,
    })),
    nextCursor: rows.length > limit && last ? {
      sortId: input.view === "chats" ? last.activityId : last.match.id, matchId: last.match.id,
    } : null,
  }
}

/**
 * A match the caller is one side of, with its conversation. Being a participant is what grants
 * access, so a match that isn't theirs and one that doesn't exist look the same: "not found".
 * Skips the inbox's latest-message lookup, which a single match has no use for.
 */
async function loadMatch(db: Db, userId: string, matchId: string) {
  const [row] = await db.select(summaryFields).from(matches)
    .innerJoin(conversations, eq(conversations.matchId, matches.id))
    .innerJoin(conversationParticipants, and(
      eq(conversationParticipants.conversationId, conversations.id),
      eq(conversationParticipants.userId, userId),
    ))
    .leftJoin(bookerProfiles, eq(bookerProfiles.userId, matches.bookerId))
    .leftJoin(talentProfiles, eq(talentProfiles.userId, matches.talentId))
    .leftJoin(roles, eq(roles.id, matches.roleId))
    .leftJoin(projects, eq(projects.id, roles.projectId))
    .where(eq(matches.id, matchId))
    .limit(1)
  if (!row) throw new MatchError("Match not found", "match_not_found")
  return row
}

function toMatch(row: SummaryRow, viewer: string): Match {
  const { match } = row
  return {
    ...matchSummary(row, viewer),
    roleId: match.roleId,
    // The column's TS type is loose by design (stored jsonb); the writer below is the only source.
    brief: match.brief as MatchBrief | null,
    briefAttachedAt: match.briefAttachedAt?.toISOString() ?? null,
  }
}

/** `match.get`: a match and its brief, to either side. The talent opening the thread reads it here. */
export async function getMatch(db: Db, userId: string, matchId: string): Promise<Match> {
  return toMatch(await loadMatch(db, userId, matchId), userId)
}

/**
 * `match.attachBrief`: the booker puts a role's brief in front of the talent. Takes the role the
 * interest was for, or the one named when it had none; the role must be the booker's own and have
 * a written brief to share. Attaching again replaces the earlier copy, so a booker can update what
 * the talent sees. Copies the offer only — see `MatchBrief`.
 */
export async function attachBrief(
  db: Db,
  bookerId: string,
  input: { matchId: string; roleId?: string | undefined },
): Promise<Match> {
  const found = await loadMatch(db, bookerId, input.matchId)
  // Only the booker may attach: the talent is the other side of a match they can read.
  if (found.match.bookerId !== bookerId) throw new MatchError("Match not found", "match_not_found")

  const roleId = input.roleId ?? found.match.roleId
  if (!roleId) throw new MatchError("Choose which role's brief to attach", "role_required")

  const [role] = await db
    .select({
      id: schema.roles.id,
      name: schema.roles.name,
      brief: schema.roles.brief,
      shootStartsOn: schema.roles.shootStartsOn,
      shootEndsOn: schema.roles.shootEndsOn,
      rateMin: schema.roles.rateMin,
      rateMax: schema.roles.rateMax,
      rateCurrency: schema.roles.rateCurrency,
      projectName: schema.projects.name,
      projectType: schema.projects.type,
    })
    .from(schema.roles)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.roles.projectId))
    .where(and(eq(schema.roles.id, roleId), eq(schema.projects.bookerId, bookerId)))
    .limit(1)
  if (!role) throw new MatchError("Role not found", "role_not_found")
  if (!role.brief) throw new MatchError("Write a brief for this role before attaching it", "role_has_no_brief")

  const brief: MatchBrief = {
    roleId: role.id,
    roleName: role.name,
    projectName: role.projectName,
    projectType: role.projectType,
    brief: role.brief,
    shootStartsOn: role.shootStartsOn,
    shootEndsOn: role.shootEndsOn,
    rateMin: role.rateMin === null ? null : Number(role.rateMin),
    rateMax: role.rateMax === null ? null : Number(role.rateMax),
    rateCurrency: role.rateCurrency,
  }
  await db.transaction(async (tx) => {
    await tx.update(schema.matches)
      .set({ brief, briefAttachedAt: new Date() })
      .where(eq(schema.matches.id, found.match.id))
    await recordPush(tx, "brief", found.match.id, [found.match.talentId])
  })

  return getMatch(db, bookerId, found.match.id)
}
