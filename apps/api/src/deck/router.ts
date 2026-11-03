import {
  deckGoalSchema,
  deckNextInput,
  deckPageSchema,
  deckPreviewInput,
  deckPreviewSchema,
  deckSessionInput,
  deckSessionSchema,
  deckSetGoalInput,
  deckStartInput,
  deckSwipeInput,
  deckSwipeResultSchema,
  deckUndoResultSchema,
} from "@workspace/schema"

import { callProcedure } from "../trpc/errors.js"
import { bookerProcedure, router } from "../trpc/trpc.js"
import { nextCards } from "./next.js"
import { previewDeck } from "./preview.js"
import { startDeck } from "./session.js"
import { setDeckGoal, swipeCard, undoSwipe } from "./swipe.js"

export const deckRouter = router({
  /**
   * Interim card source from the deck shell (M5 5.1–5.3); the app now uses `deck.start` +
   * `deck.next`. Kept for `measure:deck-payload`.
   */
  preview: bookerProcedure
    .input(deckPreviewInput)
    .output(deckPreviewSchema)
    .query(({ ctx, input }) => callProcedure(() => previewDeck(ctx.db, ctx.userId, input.limit))),

  /** Opens a deck session and materialises its ranked queue. */
  start: bookerProcedure
    .input(deckStartInput)
    .output(deckSessionSchema)
    .mutation(({ ctx, input }) => callProcedure(() => startDeck(ctx.db, ctx.userId, input))),

  /**
   * The next page of a session's queue. A mutation: serving records impressions and moves the
   * cursor, so a retry or refetch must never replay it as a read.
   */
  next: bookerProcedure
    .input(deckNextInput)
    .output(deckPageSchema)
    .mutation(({ ctx, input }) => callProcedure(() => nextCards(ctx.db, ctx.userId, input))),

  /**
   * A decision on a served card: pass, interest (onto the role's shortlist, or Saved talent),
   * or save for later (Saved talent). Ungated in M5; `verifiedBooker` gates interest from M7.
   */
  swipe: bookerProcedure
    .input(deckSwipeInput)
    .output(deckSwipeResultSchema)
    .mutation(({ ctx, input }) => callProcedure(() => swipeCard(ctx.db, ctx.userId, input))),

  /** Takes back the session's last swipe, within the free undo limit. */
  undo: bookerProcedure
    .input(deckSessionInput)
    .output(deckUndoResultSchema)
    .mutation(({ ctx, input }) => callProcedure(() => undoSwipe(ctx.db, ctx.userId, input.sessionId))),

  /** Sets or clears the session's shortlist goal. */
  setGoal: bookerProcedure
    .input(deckSetGoalInput)
    .output(deckGoalSchema)
    .mutation(({ ctx, input }) => callProcedure(() => setDeckGoal(ctx.db, ctx.userId, input))),
})
