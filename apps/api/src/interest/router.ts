import {
  autoAcceptSchema,
  incomingInterestsSchema,
  interestAcceptResultSchema,
  interestDeclineResultSchema,
  interestIdInput,
  setAutoAcceptInput,
} from "@workspace/schema"

import { callProcedure } from "../trpc/errors.js"
import { router, talentProcedure } from "../trpc/trpc.js"
import { acceptInterest, declineInterest, listIncoming, setAutoAccept } from "./service.js"

/**
 * The talent's side of a booker's right-swipe (TECH_SPEC §6 `interest`). The interest itself is
 * created by `deck.swipe`; there is no way to send one from here.
 */
export const interestRouter = router({
  /** Pending interests awaiting an answer, newest first, with the talent's auto-accept setting. */
  listIncoming: talentProcedure
    .output(incomingInterestsSchema)
    .query(({ ctx }) => callProcedure(() => listIncoming(ctx.db, ctx.userId))),

  /** Says yes: creates the match. Repeating it returns the same match. */
  accept: talentProcedure
    .input(interestIdInput)
    .output(interestAcceptResultSchema)
    .mutation(({ ctx, input }) => callProcedure(() => acceptInterest(ctx.db, ctx.userId, input.interestId))),

  /** Says no: no match, and the booker is not told. */
  decline: talentProcedure
    .input(interestIdInput)
    .output(interestDeclineResultSchema)
    .mutation(({ ctx, input }) => callProcedure(() => declineInterest(ctx.db, ctx.userId, input.interestId))),

  /** Whether a verified booker's interest becomes a match at once. Off until the talent turns it on. */
  setAutoAccept: talentProcedure
    .input(setAutoAcceptInput)
    .output(autoAcceptSchema)
    .mutation(({ ctx, input }) => callProcedure(() => setAutoAccept(ctx.db, ctx.userId, input.enabled))),
})
