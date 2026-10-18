import { TRPCError } from "@trpc/server"
import {
  enableModeInput,
  healthSchema,
  meSchema,
  refreshInput,
  requestOtpInput,
  sessionSchema,
  verifyOtpInput,
} from "@workspace/schema"

import { mediaRouter } from "../media/router.js"
import { talentRouter } from "../talent/router.js"
import { assertAdult } from "../auth/age.js"
import { otpLimiter } from "../auth/rate-limit.js"
import { enableUserMode, readMe, recordSignup } from "../auth/users.js"
import { callProcedure } from "./errors.js"
import {
  authedProcedure,
  bookerProcedure,
  publicProcedure,
  talentProcedure,
  verifiedBookerProcedure,
  adminProcedure,
  router,
} from "./trpc.js"

const pingSchema = healthSchema

/** Lightweight probes for middleware integration tests and ops checks. */
const accessRouter = router({
  authedPing: authedProcedure
    .output(pingSchema)
    .query(() => ({ ok: true as const })),
  talentPing: talentProcedure
    .output(pingSchema)
    .query(() => ({ ok: true as const })),
  bookerPing: bookerProcedure
    .output(pingSchema)
    .query(() => ({ ok: true as const })),
  verifiedBookerPing: verifiedBookerProcedure
    .output(pingSchema)
    .query(() => ({ ok: true as const })),
  adminPing: adminProcedure
    .output(pingSchema)
    .query(() => ({ ok: true as const })),
})

const authRouter = router({
  requestOtp: publicProcedure
    .input(requestOtpInput)
    .mutation(({ ctx, input }) =>
      callProcedure(async () => {
        assertAdult(input.dateOfBirth)
        otpLimiter.consume(input.email, ctx.ip)
        await ctx.auth.requestOtp(input.email)
        return { ok: true as const }
      })
    ),

  verifyOtp: publicProcedure
    .input(verifyOtpInput)
    .output(sessionSchema)
    .mutation(({ ctx, input }) =>
      callProcedure(async () => {
        assertAdult(input.dateOfBirth)
        const session = await ctx.auth.verifyOtp(input.email, input.token)
        await recordSignup(ctx.db, {
          id: session.userId,
          email: input.email,
          dateOfBirth: input.dateOfBirth,
        })
        return {
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          expiresIn: session.expiresIn,
        }
      })
    ),

  refresh: publicProcedure
    .input(refreshInput)
    .output(sessionSchema)
    .mutation(({ ctx, input }) =>
      callProcedure(async () => {
        const session = await ctx.auth.refresh(input.refreshToken)
        return {
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          expiresIn: session.expiresIn,
        }
      })
    ),

  me: authedProcedure.output(meSchema).query(({ ctx }) =>
    callProcedure(async () => {
      const me = await readMe(ctx.db, ctx.userId)
      if (!me) throw new TRPCError({ code: "UNAUTHORIZED" })
      return me
    })
  ),

  enableMode: authedProcedure
    .input(enableModeInput)
    .mutation(({ ctx, input }) =>
      callProcedure(async () => {
        const modes = await enableUserMode(ctx.db, ctx.userId, input.mode)
        return { modes }
      })
    ),
})

export const appRouter = router({
  media: mediaRouter,
  talent: talentRouter,
  health: publicProcedure.output(healthSchema).query(() => {
    // Temporary M1 Sentry probe — set SENTRY_PROBE=1 in .env, restart API, then GET /trpc/health
    if (process.env.SENTRY_PROBE === "1") {
      throw new Error(`Sentry API probe ${Date.now()}`)
    }
    return { ok: true as const }
  }),
  access: accessRouter,
  auth: authRouter,
})

export type AppRouter = typeof appRouter

export { createContext } from "./context.js"
