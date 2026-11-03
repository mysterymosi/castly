import {
  adminBookerIdInput,
  adminBookerSearchInput,
  adminBookerSearchSchema,
  adminDeckBookerSchema,
  adminDeckRunInput,
  adminDeckRunSchema,
  adminDeckSessionInput,
  adminDeckSessionSchema,
  rankingSettingsSchema,
  rankingSettingUpdateInput,
  updateVerticalWeightInput,
  verticalWeightsStateSchema,
} from "@workspace/schema"

import { listVerticalWeights, setVerticalWeight } from "../booker/vertical-weights.js"
import { callProcedure } from "../trpc/errors.js"
import { inspectorBooker, inspectSession, runInspectorDeck, searchBookers } from "./deck-inspector.js"
import { listRankingSettings, updateRankingSetting } from "./ranking-settings.js"
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

  bookers: router({
    search: adminProcedure
      .input(adminBookerSearchInput)
      .output(adminBookerSearchSchema)
      .query(({ ctx, input }) => callProcedure(() => searchBookers(ctx.db, input.query))),
  }),

  /** Deck inspector (TECH_SPEC §19): why each card ranked where it did. Nothing here writes. */
  deck: router({
    booker: adminProcedure
      .input(adminBookerIdInput)
      .output(adminDeckBookerSchema)
      .query(({ ctx, input }) => callProcedure(() => inspectorBooker(ctx.db, input.bookerId))),

    run: adminProcedure
      .input(adminDeckRunInput)
      .output(adminDeckRunSchema)
      .query(({ ctx, input }) => callProcedure(() => runInspectorDeck(ctx.db, input))),

    session: adminProcedure
      .input(adminDeckSessionInput)
      .output(adminDeckSessionSchema)
      .query(({ ctx, input }) => callProcedure(() => inspectSession(ctx.db, input))),
  }),

  /** Stage 2 weights and stage 3 fairness settings (`ranking_weights`), editable live. */
  rankingWeights: router({
    list: adminProcedure
      .output(rankingSettingsSchema)
      .query(({ ctx }) => callProcedure(() => listRankingSettings(ctx.db))),

    update: adminProcedure
      .input(rankingSettingUpdateInput)
      .output(rankingSettingsSchema)
      .mutation(({ ctx, input }) => callProcedure(() => updateRankingSetting(ctx.db, ctx.userId, input))),
  }),
})
