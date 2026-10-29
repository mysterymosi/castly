import { deckPreviewInput, deckPreviewSchema } from "@workspace/schema"

import { callProcedure } from "../trpc/errors.js"
import { bookerProcedure, router } from "../trpc/trpc.js"
import { previewDeck } from "./preview.js"

export const deckRouter = router({
  /**
   * Interim card source for the deck shell (M5 5.1–5.3), ungated beyond booker mode like the rest
   * of M5. Replaced by `deck.start` / `deck.next` in 5.4 and 5.8.
   */
  preview: bookerProcedure
    .input(deckPreviewInput)
    .output(deckPreviewSchema)
    .query(({ ctx, input }) => callProcedure(() => previewDeck(ctx.db, ctx.userId, input.limit))),
})
