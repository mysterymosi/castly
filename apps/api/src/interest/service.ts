import type { Db } from "@workspace/db"
import { schema } from "@workspace/db"
import type { BookerVertical, IncomingInterests } from "@workspace/schema"
import { and, desc, eq, gt, inArray, isNull, lte } from "drizzle-orm"

import { interestHeadline } from "./copy.js"
import { InterestError } from "./errors.js"

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]

/** How long a talent has to answer before an interest lapses. */
export const INTEREST_TTL_DAYS = 14

/** The most interests the incoming list returns; the rest wait behind it. */
export const INCOMING_LIMIT = 100

/**
 * Whether a booker counts as verified for auto-accept (PRD §6.3): professionally verified, the
 * tier M7 awards. Until M7 nobody holds it, so auto-accept stays dormant rather than firing for
 * unverified bookers — wired, flagged, and safe.
 */
export function isVerifiedBooker(tier: "phone" | "id" | "professional") {
  return tier === "professional"
}

/**
 * Accepts a pending interest: marks it and creates the match. The one place a match is born, so
 * `deck.swipe` (auto-accept) and `interest.accept` cannot diverge. M6 6.2 adds the conversation
 * and its two participants here, in the same transaction.
 */
async function acceptRow(
  tx: Tx,
  interest: { id: string; bookerId: string; talentId: string; roleId: string | null },
  now: Date,
) {
  await tx
    .update(schema.interests)
    .set({ status: "accepted", respondedAt: now })
    .where(eq(schema.interests.id, interest.id))
  const [match] = await tx
    .insert(schema.matches)
    .values({
      interestId: interest.id,
      bookerId: interest.bookerId,
      talentId: interest.talentId,
      roleId: interest.roleId,
    })
    .returning({ id: schema.matches.id })
  return match!.id
}

/**
 * Records a right-swipe as an interest, inside the swipe's transaction. Returns the interest
 * created (null when none was) and the match, when the talent's auto-accept answered it at once.
 *
 * No new interest is sent while one is pending or accepted for the same booker, talent and role,
 * or after the talent declined it: a booker who meets the talent again in another deck must not
 * pester them. A lapsed interest does not block — the talent never answered, and the booker may
 * ask again.
 */
export async function recordInterest(
  tx: Tx,
  input: { bookerId: string; talentId: string; roleId: string | null },
  now: Date = new Date(),
): Promise<{ interestId: string | null; matchId: string | null }> {
  const sameAsk = and(
    eq(schema.interests.bookerId, input.bookerId),
    eq(schema.interests.talentId, input.talentId),
    input.roleId ? eq(schema.interests.roleId, input.roleId) : isNull(schema.interests.roleId),
  )

  // A pending interest past its expiry is not open, whether or not the job has caught up.
  await tx
    .update(schema.interests)
    .set({ status: "expired" })
    .where(and(sameAsk, eq(schema.interests.status, "pending"), lte(schema.interests.expiresAt, now)))

  const [existing] = await tx
    .select({ id: schema.interests.id })
    .from(schema.interests)
    .where(and(sameAsk, inArray(schema.interests.status, ["pending", "accepted", "declined"])))
    .limit(1)
  if (existing) return { interestId: null, matchId: null }

  const expiresAt = new Date(now.getTime() + INTEREST_TTL_DAYS * 24 * 60 * 60 * 1000)
  // The partial unique index settles a race between two swipes the check above both missed.
  const [created] = await tx
    .insert(schema.interests)
    .values({ ...input, expiresAt })
    .onConflictDoNothing()
    .returning({ id: schema.interests.id })
  if (!created) return { interestId: null, matchId: null }

  const [parties] = await tx
    .select({
      autoAccept: schema.talentProfiles.autoAcceptVerified,
      tier: schema.bookerProfiles.verificationTier,
    })
    .from(schema.talentProfiles)
    .innerJoin(schema.bookerProfiles, eq(schema.bookerProfiles.userId, input.bookerId))
    .where(eq(schema.talentProfiles.userId, input.talentId))
    .limit(1)
  if (parties?.autoAccept && isVerifiedBooker(parties.tier)) {
    const matchId = await acceptRow(tx, { ...input, id: created.id }, now)
    return { interestId: created.id, matchId }
  }
  return { interestId: created.id, matchId: null }
}

/**
 * Takes back a pending interest when the booker undoes the swipe that sent it. Returns false when
 * the talent has already answered — an accepted or declined interest cannot be unsent, so the undo
 * is refused. A lapsed one is left as it is; there is nothing to withdraw.
 */
export async function withdrawInterest(tx: Tx, interestId: string) {
  const [row] = await tx
    .select({ status: schema.interests.status })
    .from(schema.interests)
    .where(eq(schema.interests.id, interestId))
    .for("update")
    .limit(1)
  if (!row || row.status === "expired") return true
  if (row.status !== "pending") return false
  await tx.delete(schema.interests).where(eq(schema.interests.id, interestId))
  return true
}

/** The talent's pending, unexpired interests, newest first, with who is asking and for what. */
export async function listIncoming(db: Db, talentId: string, now: Date = new Date()): Promise<IncomingInterests> {
  const rows = await db
    .select({
      id: schema.interests.id,
      createdAt: schema.interests.createdAt,
      expiresAt: schema.interests.expiresAt,
      vertical: schema.bookerProfiles.vertical,
      companyName: schema.bookerProfiles.companyName,
      verificationTier: schema.bookerProfiles.verificationTier,
      roleId: schema.roles.id,
      roleName: schema.roles.name,
      projectName: schema.projects.name,
      projectType: schema.projects.type,
    })
    .from(schema.interests)
    .innerJoin(schema.bookerProfiles, eq(schema.bookerProfiles.userId, schema.interests.bookerId))
    .leftJoin(schema.roles, eq(schema.roles.id, schema.interests.roleId))
    .leftJoin(schema.projects, eq(schema.projects.id, schema.roles.projectId))
    .where(
      and(
        eq(schema.interests.talentId, talentId),
        eq(schema.interests.status, "pending"),
        gt(schema.interests.expiresAt, now),
      ),
    )
    .orderBy(desc(schema.interests.createdAt), desc(schema.interests.id))
    .limit(INCOMING_LIMIT)

  const [profile] = await db
    .select({ autoAccept: schema.talentProfiles.autoAcceptVerified })
    .from(schema.talentProfiles)
    .where(eq(schema.talentProfiles.userId, talentId))
    .limit(1)

  return {
    autoAccept: profile?.autoAccept ?? false,
    interests: rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      booker: {
        vertical: row.vertical as BookerVertical,
        companyName: row.companyName,
        verificationTier: row.verificationTier,
      },
      role:
        row.roleId && row.roleName && row.projectName
          ? { id: row.roleId, name: row.roleName, projectName: row.projectName, projectType: row.projectType }
          : null,
      headline: interestHeadline(row.vertical as BookerVertical, row.projectName),
    })),
  }
}

type Answer = { kind: "done"; matchId: string | null } | { kind: "missing" | "closed" | "expired" }

function throwUnanswered(answer: Exclude<Answer, { kind: "done" }>): never {
  if (answer.kind === "missing") throw new InterestError("Interest not found", "interest_not_found")
  if (answer.kind === "expired") throw new InterestError("This interest has expired", "interest_expired")
  throw new InterestError("This interest has already been answered", "interest_closed")
}

/**
 * `interest.accept`: the talent says yes, creating the match. Repeating it returns the same
 * match, so a retry is safe. Past `expires_at` it flips the interest to expired (committed, then
 * refused) rather than leaving the job as the only thing that closes it.
 */
export async function acceptInterest(db: Db, talentId: string, interestId: string, now: Date = new Date()) {
  const answer = await db.transaction(async (tx): Promise<Answer> => {
    const [row] = await tx
      .select()
      .from(schema.interests)
      .where(and(eq(schema.interests.id, interestId), eq(schema.interests.talentId, talentId)))
      .for("update")
      .limit(1)
    if (!row) return { kind: "missing" }
    if (row.status === "accepted") {
      const [match] = await tx
        .select({ id: schema.matches.id })
        .from(schema.matches)
        .where(eq(schema.matches.interestId, row.id))
        .limit(1)
      return { kind: "done", matchId: match?.id ?? null }
    }
    if (row.status === "expired") return { kind: "expired" }
    if (row.status !== "pending") return { kind: "closed" }
    if (row.expiresAt <= now) {
      await tx.update(schema.interests).set({ status: "expired" }).where(eq(schema.interests.id, row.id))
      return { kind: "expired" }
    }
    return { kind: "done", matchId: await acceptRow(tx, row, now) }
  })
  if (answer.kind !== "done") throwUnanswered(answer)
  return { interestId, matchId: answer.matchId! }
}

/** `interest.decline`: the talent says no. No match, nothing sent to the booker. Idempotent. */
export async function declineInterest(db: Db, talentId: string, interestId: string, now: Date = new Date()) {
  const answer = await db.transaction(async (tx): Promise<Answer> => {
    const [row] = await tx
      .select()
      .from(schema.interests)
      .where(and(eq(schema.interests.id, interestId), eq(schema.interests.talentId, talentId)))
      .for("update")
      .limit(1)
    if (!row) return { kind: "missing" }
    if (row.status === "declined") return { kind: "done", matchId: null }
    if (row.status === "expired") return { kind: "expired" }
    if (row.status !== "pending") return { kind: "closed" }
    if (row.expiresAt <= now) {
      await tx.update(schema.interests).set({ status: "expired" }).where(eq(schema.interests.id, row.id))
      return { kind: "expired" }
    }
    await tx
      .update(schema.interests)
      .set({ status: "declined", respondedAt: now })
      .where(eq(schema.interests.id, row.id))
    return { kind: "done", matchId: null }
  })
  if (answer.kind !== "done") throwUnanswered(answer)
  return { interestId, status: "declined" as const }
}

/**
 * `interest.setAutoAccept`: whether an interest from a verified booker becomes a match at once.
 * Applies to interests sent after the change; ones already pending stay the talent's to answer.
 */
export async function setAutoAccept(db: Db, talentId: string, enabled: boolean) {
  const [row] = await db
    .update(schema.talentProfiles)
    .set({ autoAcceptVerified: enabled })
    .where(eq(schema.talentProfiles.userId, talentId))
    .returning({ autoAccept: schema.talentProfiles.autoAcceptVerified })
  if (!row) throw new InterestError("Create your talent profile first", "talent_profile_required")
  return { autoAccept: row.autoAccept }
}

/**
 * The expiry job: flips every pending interest past `expires_at` to expired. No match, no
 * notification. One statement, so a retry or a second runner changes nothing; `accept` and
 * `decline` enforce expiry themselves, so this only keeps the stored status honest.
 */
export async function expireInterests(db: Db, now: Date = new Date()) {
  const expired = await db
    .update(schema.interests)
    .set({ status: "expired" })
    .where(and(eq(schema.interests.status, "pending"), lte(schema.interests.expiresAt, now)))
    .returning({ id: schema.interests.id })
  return expired.length
}
