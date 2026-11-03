import type { Db } from "@workspace/db"
import { schema } from "@workspace/db"
import type {
  shortlistCompareInput,
  shortlistEntryInput,
  shortlistNoteInput,
  shortlistReorderInput,
} from "@workspace/schema"
import { and, asc, desc, eq, inArray, notInArray, sql } from "drizzle-orm"
import type { z } from "zod"

import { BookerError } from "../booker/errors.js"
import { deckCard } from "../deck/preview.js"

function summaryQuery(db: Db) {
  return db
    .select({
      id: schema.shortlists.id,
      name: schema.shortlists.name,
      roleId: schema.shortlists.roleId,
      projectId: schema.projects.id,
      projectName: schema.projects.name,
      entryCount: sql<number>`(select count(*)::int from ${schema.shortlistEntries} e where e.shortlist_id = ${schema.shortlists.id})`,
      updatedAt: schema.shortlists.updatedAt,
    })
    .from(schema.shortlists)
    .leftJoin(schema.roles, eq(schema.shortlists.roleId, schema.roles.id))
    .leftJoin(schema.projects, eq(schema.roles.projectId, schema.projects.id))
}

type SummaryRow = Awaited<ReturnType<ReturnType<typeof summaryQuery>["execute"]>>[number]

const summary = (row: SummaryRow) => ({ ...row, updatedAt: row.updatedAt.toISOString() })

/** The booker's shortlists, Saved talent first, then the most recently changed. */
export async function listShortlists(db: Db, bookerId: string) {
  const rows = await summaryQuery(db)
    .where(eq(schema.shortlists.bookerId, bookerId))
    .orderBy(sql`${schema.shortlists.roleId} is not null`, desc(schema.shortlists.updatedAt))
  return { shortlists: rows.map(summary) }
}

/** The booker's own shortlist; someone else's is indistinguishable from a missing one. */
async function ownedShortlist(db: Db, bookerId: string, shortlistId: string) {
  const [row] = await summaryQuery(db)
    .where(and(eq(schema.shortlists.id, shortlistId), eq(schema.shortlists.bookerId, bookerId)))
    .limit(1)
  if (!row) throw new BookerError("Shortlist not found", "shortlist_not_found")
  return row
}

/** Talents as deck cards, serialized for this booker, in the order asked for. Live talents only. */
async function cardsFor(db: Db, bookerId: string, talentIds: string[]) {
  if (talentIds.length === 0) return []
  const profiles = await db
    .select()
    .from(schema.talentProfiles)
    .where(and(inArray(schema.talentProfiles.userId, talentIds), eq(schema.talentProfiles.status, "live")))
  const byId = new Map(profiles.map((p) => [p.userId, p]))
  const live = talentIds.filter((id) => byId.has(id))
  return Promise.all(live.map((id) => deckCard(db, bookerId, byId.get(id)!)))
}

/**
 * One shortlist with its talents: the booker's order first, then the unranked newest first. A talent who has since gone offline stays on the
 * list (the booker chose them) but is left out of what's shown until they're live again.
 */
export async function getShortlist(db: Db, bookerId: string, shortlistId: string) {
  const shortlist = await ownedShortlist(db, bookerId, shortlistId)
  const entries = await db
    .select({
      talentId: schema.shortlistEntries.talentId,
      note: schema.shortlistEntries.note,
      addedAt: schema.shortlistEntries.addedAt,
    })
    .from(schema.shortlistEntries)
    .where(eq(schema.shortlistEntries.shortlistId, shortlistId))
    .orderBy(asc(schema.shortlistEntries.rank), desc(schema.shortlistEntries.addedAt))
  const cards = await cardsFor(
    db,
    bookerId,
    entries.map((e) => e.talentId),
  )
  const byTalent = new Map(entries.map((e) => [e.talentId, e]))
  return {
    shortlist: summary(shortlist),
    entries: cards.map((card) => {
      const entry = byTalent.get(card.talent.profile.userId)!
      return { addedAt: entry.addedAt.toISOString(), note: entry.note, card }
    }),
  }
}

/** Two to four talents from one shortlist, side by side, as this booker may see them. */
export async function compareShortlist(
  db: Db,
  bookerId: string,
  input: z.output<typeof shortlistCompareInput>,
) {
  await ownedShortlist(db, bookerId, input.shortlistId)
  const onList = await db
    .select({ talentId: schema.shortlistEntries.talentId })
    .from(schema.shortlistEntries)
    .where(
      and(
        eq(schema.shortlistEntries.shortlistId, input.shortlistId),
        inArray(schema.shortlistEntries.talentId, input.talentIds),
      ),
    )
  if (onList.length !== new Set(input.talentIds).size) {
    throw new BookerError("Compare talents from the same shortlist", "not_on_shortlist")
  }
  return { talents: await cardsFor(db, bookerId, input.talentIds) }
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]

const touch = (db: Db | Tx, shortlistId: string) =>
  db.update(schema.shortlists).set({ updatedAt: new Date() }).where(eq(schema.shortlists.id, shortlistId))

const entryOn = (shortlistId: string, talentId: string) =>
  and(eq(schema.shortlistEntries.shortlistId, shortlistId), eq(schema.shortlistEntries.talentId, talentId))

/**
 * Take a talent off the list. The swipe that put them there stands (it was a real decision, and
 * the talent stays out of that role's deck); undoing that swipe later is then a no-op on the list.
 */
export async function removeFromShortlist(db: Db, bookerId: string, input: z.output<typeof shortlistEntryInput>) {
  await ownedShortlist(db, bookerId, input.shortlistId)
  const removed = await db
    .delete(schema.shortlistEntries)
    .where(entryOn(input.shortlistId, input.talentId))
    .returning({ talentId: schema.shortlistEntries.talentId })
  if (removed.length === 0) throw new BookerError("That talent isn't on this shortlist", "not_on_shortlist")
  await touch(db, input.shortlistId)
  return getShortlist(db, bookerId, input.shortlistId)
}

/** Set or clear the booker's private note on one entry. */
export async function setShortlistNote(db: Db, bookerId: string, input: z.output<typeof shortlistNoteInput>) {
  await ownedShortlist(db, bookerId, input.shortlistId)
  const updated = await db
    .update(schema.shortlistEntries)
    .set({ note: input.note })
    .where(entryOn(input.shortlistId, input.talentId))
    .returning({ talentId: schema.shortlistEntries.talentId })
  if (updated.length === 0) throw new BookerError("That talent isn't on this shortlist", "not_on_shortlist")
  await touch(db, input.shortlistId)
  return getShortlist(db, bookerId, input.shortlistId)
}

/**
 * Put the list in the booker's order: rank 0..n-1 for the talents given, NULL for the rest, which
 * then sort after (newest first). Later right-swipes also land unranked, below the booker's order.
 */
export async function reorderShortlist(db: Db, bookerId: string, input: z.output<typeof shortlistReorderInput>) {
  await ownedShortlist(db, bookerId, input.shortlistId)
  await db.transaction(async (tx) => {
    const onList = await tx
      .select({ talentId: schema.shortlistEntries.talentId })
      .from(schema.shortlistEntries)
      .where(
        and(
          eq(schema.shortlistEntries.shortlistId, input.shortlistId),
          inArray(schema.shortlistEntries.talentId, input.talentIds),
        ),
      )
      .for("update")
    if (onList.length !== input.talentIds.length) {
      throw new BookerError("Reorder only the talents on this shortlist", "not_on_shortlist")
    }
    const ranks = sql.join(
      input.talentIds.map((id, i) => sql`when ${id}::uuid then ${i}::int`),
      sql` `,
    )
    await tx
      .update(schema.shortlistEntries)
      .set({ rank: sql`case ${schema.shortlistEntries.talentId} ${ranks} end` })
      .where(
        and(
          eq(schema.shortlistEntries.shortlistId, input.shortlistId),
          inArray(schema.shortlistEntries.talentId, input.talentIds),
        ),
      )
    await tx
      .update(schema.shortlistEntries)
      .set({ rank: null })
      .where(
        and(
          eq(schema.shortlistEntries.shortlistId, input.shortlistId),
          notInArray(schema.shortlistEntries.talentId, input.talentIds),
        ),
      )
    await touch(tx, input.shortlistId)
  })
  return getShortlist(db, bookerId, input.shortlistId)
}
