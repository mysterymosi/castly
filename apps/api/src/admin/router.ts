import { updateVerticalWeightInput, verticalWeightsStateSchema } from "@workspace/schema"

import { listVerticalWeights, setVerticalWeight } from "../booker/vertical-weights.js"
import { callProcedure } from "../trpc/errors.js"
import { adminProcedure, router } from "../trpc/trpc.js"

/** Ops console procedures. Every one is behind `adminProcedure` (the `user_modes` admin row). */
export const adminRouter = router({
  /** Booker vertical → category cold-start weights (PRD §7.9), editable without a deploy. */
  verticalWeights: router({
    list: adminProcedure.output(verticalWeightsStateSchema).query(({ ctx }) => {
      return callProcedure(() => listVerticalWeights(ctx.db))
    }),

    update: adminProcedure
      .input(updateVerticalWeightInput)
      .output(verticalWeightsStateSchema)
      .mutation(({ ctx, input }) => {
        return callProcedure(() => setVerticalWeight(ctx.db, ctx.userId, input))
      }),
  }),
})
