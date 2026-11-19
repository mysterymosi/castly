import type { Db } from "@workspace/db"
import { schema } from "@workspace/db"
import type { Match, MatchBrief } from "@workspace/schema"
import { and, eq, or } from "drizzle-orm"

import { recordPush } from "../notification/events.js"
import { MatchError } from "./errors.js"

/**
 * A match the caller is one side of, with its conversation. A match that isn't theirs and one
 * that doesn't exist look the same: "not found".
 */
async function loadMatch(db: Db, userId: string, matchId: string) {
  const [row] = await db
    .select({ match: schema.matches, conversationId: schema.conversations.id })
    .from(schema.matches)
    .innerJoin(schema.conversations, eq(schema.conversations.matchId, schema.matches.id))
    .where(
      and(
        eq(schema.matches.id, matchId),
        or(eq(schema.matches.bookerId, userId), eq(schema.matches.talentId, userId)),
      ),
    )
    .limit(1)
  if (!row) throw new MatchError("Match not found", "match_not_found")
  return row
}

function toMatch(row: Awaited<ReturnType<typeof loadMatch>>): Match {
  const { match } = row
  return {
    id: match.id,
    conversationId: row.conversationId,
    roleId: match.roleId,
    createdAt: match.createdAt.toISOString(),
    // The column's TS type is loose by design (stored jsonb); the writer below is the only source.
    brief: match.brief as MatchBrief | null,
    briefAttachedAt: match.briefAttachedAt?.toISOString() ?? null,
  }
}

/** `match.get`: a match and its brief, to either side. The talent opening the thread reads it here. */
export async function getMatch(db: Db, userId: string, matchId: string): Promise<Match> {
  return toMatch(await loadMatch(db, userId, matchId))
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
