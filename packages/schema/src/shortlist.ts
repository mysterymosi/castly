import { z } from "zod"

import { deckCardSchema } from "./deck"

/**
 * A booker's shortlist: one per role, plus the general "Saved talent" list (`roleId` null).
 * Right-swipes land on the role's (or Saved talent with no role); "save for later" always lands
 * on Saved talent (PRD §7.2.2).
 */
export const shortlistSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  roleId: z.uuid().nullable(),
  projectId: z.uuid().nullable(),
  projectName: z.string().nullable(),
  entryCount: z.number().int(),
  updatedAt: z.string(),
})

export const shortlistListSchema = z.object({ shortlists: z.array(shortlistSummarySchema) })

export const shortlistIdInput = z.object({ shortlistId: z.uuid() })

/**
 * One talent on a shortlist, as a deck card: talent data leaves the API only through
 * `serializeTalent` (TECH_SPEC §6.1), so the row's name, photo and category come from the card.
 */
export const shortlistEntrySchema = z.object({
  addedAt: z.string(),
  /** The booker's own note on this talent; never shown to the talent. */
  note: z.string().nullable(),
  card: deckCardSchema,
})

export const shortlistDetailSchema = z.object({
  shortlist: shortlistSummarySchema,
  entries: z.array(shortlistEntrySchema),
})

export const SHORTLIST_NOTE_MAX = 500

/** One talent on one shortlist. */
export const shortlistEntryInput = z.object({ shortlistId: z.uuid(), talentId: z.uuid() })

/** Set the booker's note on an entry; blank or null clears it. */
export const shortlistNoteInput = shortlistEntryInput.extend({
  note: z
    .string()
    .trim()
    .max(SHORTLIST_NOTE_MAX)
    .nullable()
    .transform((note) => note || null),
})

/**
 * The booker's order for the list, top first. Every talent named must be on it; entries left out
 * (say, a talent who has gone offline and isn't shown) lose their place and sort after.
 */
export const shortlistReorderInput = z.object({
  shortlistId: z.uuid(),
  talentIds: z
    .array(z.uuid())
    .min(1)
    .max(500)
    .refine((ids) => new Set(ids).size === ids.length, "Each talent once"),
})

/** Two to four talents from one shortlist, side by side (PRD §7.2.2 compare view). */
export const shortlistCompareInput = z.object({
  shortlistId: z.uuid(),
  talentIds: z.array(z.uuid()).min(2).max(4),
})

/**
 * Each talent as a deck card: serialized for this booker, so the comparison shows exactly what
 * the booker may see (visible standard attributes, languages, skills, credits) and nothing more.
 */
export const shortlistCompareSchema = z.object({ talents: z.array(deckCardSchema) })

export type ShortlistSummary = z.infer<typeof shortlistSummarySchema>
export type ShortlistEntry = z.infer<typeof shortlistEntrySchema>
export type ShortlistDetail = z.infer<typeof shortlistDetailSchema>
export type ShortlistCompare = z.infer<typeof shortlistCompareSchema>
