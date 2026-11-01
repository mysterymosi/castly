import {
  shortlistCompareInput,
  shortlistCompareSchema,
  shortlistDetailSchema,
  shortlistEntryInput,
  shortlistIdInput,
  shortlistListSchema,
  shortlistNoteInput,
  shortlistReorderInput,
} from "@workspace/schema"

import { callProcedure } from "../trpc/errors.js"
import { bookerProcedure, router } from "../trpc/trpc.js"
import {
  compareShortlist,
  getShortlist,
  listShortlists,
  removeFromShortlist,
  reorderShortlist,
  setShortlistNote,
} from "./service.js"

/** Shortlists are what deck swipes produce (PRD §7.2.2); `deck.swipe` adds to them; the
 * booker removes, annotates and orders entries here (TECH_SPEC §6 `shortlist`). */
export const shortlistRouter = router({
  list: bookerProcedure
    .output(shortlistListSchema)
    .query(({ ctx }) => callProcedure(() => listShortlists(ctx.db, ctx.userId))),

  get: bookerProcedure
    .input(shortlistIdInput)
    .output(shortlistDetailSchema)
    .query(({ ctx, input }) => callProcedure(() => getShortlist(ctx.db, ctx.userId, input.shortlistId))),

  compare: bookerProcedure
    .input(shortlistCompareInput)
    .output(shortlistCompareSchema)
    .query(({ ctx, input }) => callProcedure(() => compareShortlist(ctx.db, ctx.userId, input))),

  remove: bookerProcedure
    .input(shortlistEntryInput)
    .output(shortlistDetailSchema)
    .mutation(({ ctx, input }) => callProcedure(() => removeFromShortlist(ctx.db, ctx.userId, input))),

  setNote: bookerProcedure
    .input(shortlistNoteInput)
    .output(shortlistDetailSchema)
    .mutation(({ ctx, input }) => callProcedure(() => setShortlistNote(ctx.db, ctx.userId, input))),

  reorder: bookerProcedure
    .input(shortlistReorderInput)
    .output(shortlistDetailSchema)
    .mutation(({ ctx, input }) => callProcedure(() => reorderShortlist(ctx.db, ctx.userId, input))),
})
