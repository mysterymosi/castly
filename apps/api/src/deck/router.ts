import {
  deckNextInput,
  deckPageSchema,
  deckPreviewInput,
  deckPreviewSchema,
  deckSessionSchema,
  deckStartInput,
} from "@workspace/schema"

import { callProcedure } from "../trpc/errors.js"
import { bookerProcedure, router } from "../trpc/trpc.js"
import { nextCards } from "./next.js"
import { previewDeck } from "./preview.js"
import { startDeck } from "./session.js"

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
})
