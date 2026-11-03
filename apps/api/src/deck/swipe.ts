import type { Db } from "@workspace/db"
import { schema } from "@workspace/db"
import type { DeckGoal, deckSetGoalInput, deckSwipeInput } from "@workspace/schema"
import { and, desc, eq, isNotNull, isNull, ne, sql } from "drizzle-orm"
import type { z } from "zod"

import { DeckError } from "./errors.js"

/** Undos a free booker gets per session (PRD §7.2.2). Pro bookers (M10) get unlimited. */
export const FREE_UNDO_LIMIT = 3

/** The general list: right-swipes with no role, and every "save for later". */
export const SAVED_TALENT_NAME = "Saved talent"

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]

/** The booker's own open session, locked for the rest of the transaction (as `deck.next` does). */
async function lockSession(tx: Tx, bookerId: string, sessionId: string) {
  const [session] = await tx
    .select()
    .from(schema.deckSessions)
    .where(and(eq(schema.deckSessions.id, sessionId), eq(schema.deckSessions.bookerId, bookerId)))
    .for("update")
    .limit(1)
  if (!session) throw new DeckError("Deck session not found", "session_not_found")
  if (session.endedAt) throw new DeckError("This deck session has ended", "session_ended")
  return session
}

/** Progress toward the session goal: talents shortlisted by a live interest swipe. */
async function goalOf(tx: Tx, session: { id: string; goalCount: number | null }): Promise<DeckGoal> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.swipes)
    .where(
      and(
        eq(schema.swipes.sessionId, session.id),
        eq(schema.swipes.direction, "interest"),
        isNull(schema.swipes.undoneAt),
      ),
    )
  return { target: session.goalCount, shortlisted: row?.n ?? 0 }
}

async function undosLeft(tx: Tx, sessionId: string) {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.swipes)
    .where(and(eq(schema.swipes.sessionId, sessionId), isNotNull(schema.swipes.undoneAt)))
  return Math.max(0, FREE_UNDO_LIMIT - (row?.n ?? 0))
}

/** The booker's shortlist for a role (or Saved talent with none), created on first use. */
async function shortlistFor(tx: Tx, bookerId: string, roleId: string | null) {
  let name = SAVED_TALENT_NAME
  if (roleId) {
    const [role] = await tx
      .select({ name: schema.roles.name })
      .from(schema.roles)
      .where(eq(schema.roles.id, roleId))
      .limit(1)
    if (role) name = role.name
  }
  const [row] = await tx
    .insert(schema.shortlists)
    .values({ bookerId, roleId, name })
    .onConflictDoUpdate({
      target: [schema.shortlists.bookerId, schema.shortlists.roleId],
      set: { updatedAt: new Date() },
    })
    .returning({ id: schema.shortlists.id })
  return row!.id
}

/** Today's interest count for the talent, for exposure reporting (`talent_exposure_daily`). */
async function countInterest(tx: Tx, talentId: string, delta: 1 | -1, day: Date | null = null) {
  const date = day ? sql`${day.toISOString()}::timestamptz::date` : sql`current_date`
  if (delta === 1) {
    await tx
      .insert(schema.talentExposureDaily)
      .values({ talentId, day: date, interests: 1 })
      .onConflictDoUpdate({
        target: [schema.talentExposureDaily.talentId, schema.talentExposureDaily.day],
        set: { interests: sql`${schema.talentExposureDaily.interests} + 1` },
      })
    return
  }
  await tx
    .update(schema.talentExposureDaily)
    .set({ interests: sql`greatest(0, ${schema.talentExposureDaily.interests} - 1)` })
    .where(and(eq(schema.talentExposureDaily.talentId, talentId), eq(schema.talentExposureDaily.day, date)))
}

/**
 * `deck.swipe`: records a decision on a served card (PRD §7.2.2). Pass only records it — stage 1
 * then hides the talent for this role for 30 days. Interest also puts the talent on the role's
 * shortlist (Saved talent when there's no role); save for later puts them on Saved talent. One
 * live decision per card: an undo frees it.
 */
export async function swipeCard(db: Db, bookerId: string, input: z.output<typeof deckSwipeInput>) {
  return db.transaction(async (tx) => {
    const session = await lockSession(tx, bookerId, input.sessionId)
    const [card] = await tx
      .select({ talentId: schema.deckQueue.talentId, servedAt: schema.deckQueue.servedAt })
      .from(schema.deckQueue)
      .where(and(eq(schema.deckQueue.sessionId, session.id), eq(schema.deckQueue.position, input.position)))
      .limit(1)
    if (!card?.servedAt) throw new DeckError("That card hasn't been served in this session", "card_not_served")
    const [decided] = await tx
      .select({ id: schema.swipes.id })
      .from(schema.swipes)
      .where(
        and(
          eq(schema.swipes.sessionId, session.id),
          eq(schema.swipes.position, input.position),
          isNull(schema.swipes.undoneAt),
        ),
      )
      .limit(1)
    if (decided) throw new DeckError("You've already decided on this card", "already_decided")

    let shortlistId: string | null = null
    let entryAdded = false
    if (input.direction !== "pass") {
      shortlistId = await shortlistFor(tx, bookerId, input.direction === "interest" ? session.roleId : null)
      const added = await tx
        .insert(schema.shortlistEntries)
        .values({ shortlistId, talentId: card.talentId })
        .onConflictDoNothing()
        .returning({ talentId: schema.shortlistEntries.talentId })
      entryAdded = added.length > 0
    }

    await tx.insert(schema.swipes).values({
      bookerId,
      talentId: card.talentId,
      roleId: session.roleId,
      direction: input.direction,
      source: "deck",
      sessionId: session.id,
      position: input.position,
      shortlistId,
      entryAdded,
    })
    if (input.direction === "interest") await countInterest(tx, card.talentId, 1)

    return { shortlistId, goal: await goalOf(tx, session), undosLeft: await undosLeft(tx, session.id) }
  })
}

/**
 * `deck.undo`: takes back the session's latest live swipe — `FREE_UNDO_LIMIT` per session. The
 * swipe keeps its row (`undone_at`), so the talent is no longer hidden by it; a shortlist entry
 * it created is removed unless another live swipe also put the talent there. Returns the card's
 * position so the deck steps back to it.
 */
export async function undoSwipe(db: Db, bookerId: string, sessionId: string) {
  return db.transaction(async (tx) => {
    const session = await lockSession(tx, bookerId, sessionId)
    if ((await undosLeft(tx, session.id)) === 0) {
      throw new DeckError(`You can undo ${FREE_UNDO_LIMIT} swipes per session`, "undo_limit")
    }
    const [last] = await tx
      .select()
      .from(schema.swipes)
      .where(and(eq(schema.swipes.sessionId, session.id), isNull(schema.swipes.undoneAt)))
      .orderBy(desc(schema.swipes.createdAt), desc(schema.swipes.id))
      .limit(1)
    if (!last) throw new DeckError("There's nothing to undo", "nothing_to_undo")

    await tx.update(schema.swipes).set({ undoneAt: new Date() }).where(eq(schema.swipes.id, last.id))
    if (last.shortlistId && last.entryAdded) {
      const [other] = await tx
        .select({ id: schema.swipes.id })
        .from(schema.swipes)
        .where(
          and(
            eq(schema.swipes.shortlistId, last.shortlistId),
            eq(schema.swipes.talentId, last.talentId),
            isNull(schema.swipes.undoneAt),
            ne(schema.swipes.id, last.id),
          ),
        )
        .limit(1)
      if (!other) {
        await tx
          .delete(schema.shortlistEntries)
          .where(
            and(
              eq(schema.shortlistEntries.shortlistId, last.shortlistId),
              eq(schema.shortlistEntries.talentId, last.talentId),
            ),
          )
      }
    }
    if (last.direction === "interest") await countInterest(tx, last.talentId, -1, last.createdAt)

    return {
      position: last.position!,
      talentId: last.talentId,
      goal: await goalOf(tx, session),
      undosLeft: await undosLeft(tx, session.id),
    }
  })
}

/** `deck.setGoal`: sets or clears the session's shortlist target, returning the progress. */
export async function setDeckGoal(db: Db, bookerId: string, input: z.output<typeof deckSetGoalInput>) {
  return db.transaction(async (tx) => {
    const session = await lockSession(tx, bookerId, input.sessionId)
    await tx
      .update(schema.deckSessions)
      .set({ goalCount: input.goalCount })
      .where(eq(schema.deckSessions.id, session.id))
    return goalOf(tx, { id: session.id, goalCount: input.goalCount })
  })
}
