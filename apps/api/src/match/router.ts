import { attachBriefInput, matchIdInput, matchListInput, matchListSchema, matchSchema } from "@workspace/schema"

import { callProcedure } from "../trpc/errors.js"
import { authedProcedure, bookerProcedure, router } from "../trpc/trpc.js"
import { attachBrief, getMatch, listMatches } from "./service.js"

/**
 * A match and what the booker has put in front of the talent (TECH_SPEC §6 `match`).
 */
export const matchRouter = router({
  list: authedProcedure
    .input(matchListInput)
    .output(matchListSchema)
    .query(({ ctx, input }) => callProcedure(() => listMatches(ctx.db, ctx.userId, input))),
  /** Either side of the match reads it, brief included. */
  get: authedProcedure
    .input(matchIdInput)
    .output(matchSchema)
    .query(({ ctx, input }) => callProcedure(() => getMatch(ctx.db, ctx.userId, input.matchId))),

  /** The booker attaches a role's brief, replacing any earlier one. */
  attachBrief: bookerProcedure
    .input(attachBriefInput)
    .output(matchSchema)
    .mutation(({ ctx, input }) => callProcedure(() => attachBrief(ctx.db, ctx.userId, input))),
})
