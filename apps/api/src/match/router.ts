import { attachBriefInput, matchIdInput, matchSchema } from "@workspace/schema"

import { callProcedure } from "../trpc/errors.js"
import { authedProcedure, bookerProcedure, router } from "../trpc/trpc.js"
import { attachBrief, getMatch } from "./service.js"

/**
 * A match, and what the booker has put in front of the talent (TECH_SPEC §6 `match`). `list`
 * arrives with the inbox in 6.6.
 */
export const matchRouter = router({
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
