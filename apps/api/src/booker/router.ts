import { bookerProfileStateSchema, updateBookerProfileInput } from "@workspace/schema"

import { callProcedure } from "../trpc/errors.js"
import { bookerProcedure, router } from "../trpc/trpc.js"
import {
  getBookerProfileState,
  submitBookerVerification,
  updateBookerProfile,
} from "./service.js"

/**
 * Booker mode is checked against the `user_modes` row on every call (`bookerProcedure`); no
 * client-sent mode is ever trusted.
 */
export const bookerRouter = router({
  getProfile: bookerProcedure.output(bookerProfileStateSchema).query(({ ctx }) => {
    return callProcedure(() => getBookerProfileState(ctx.db, ctx.userId))
  }),

  updateProfile: bookerProcedure
    .input(updateBookerProfileInput)
    .output(bookerProfileStateSchema)
    .mutation(({ ctx, input }) => {
      return callProcedure(() => updateBookerProfile(ctx.db, ctx.userId, input))
    }),

  /** Stub until M7: records the request; does not change `verification_tier`. */
  submitVerification: bookerProcedure.output(bookerProfileStateSchema).mutation(({ ctx }) => {
    return callProcedure(() => submitBookerVerification(ctx.db, ctx.userId))
  }),
})
