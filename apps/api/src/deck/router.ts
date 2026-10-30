import {
  deckPreviewInput,
  deckPreviewSchema,
  deckSessionSchema,
  deckStartInput,
} from "@workspace/schema"

import { callProcedure } from "../trpc/errors.js"
import { bookerProcedure, router } from "../trpc/trpc.js"
import { previewDeck } from "./preview.js"
import { startDeck } from "./session.js"

export const deckRouter = router({
  /**
   * Interim card source for the deck shell (M5 5.1–5.3), ungated beyond booker mode like the rest
   * of M5. The app moves to `deck.start` + `deck.next` once `deck.next` serves cards (5.8).
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
})
