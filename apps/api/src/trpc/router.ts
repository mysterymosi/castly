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

import { assertAdult, InvalidDateOfBirth, UnderageError } from "../auth/age.js"
import { OtpRateLimited, otpLimiter } from "../auth/rate-limit.js"
import { enableUserMode, readMe, recordSignup } from "../auth/users.js"
import {
  authedProcedure,
  bookerProcedure,
  publicProcedure,
  talentProcedure,
  verifiedBookerProcedure,
  adminProcedure,
  t,
} from "./trpc.js"

function asTrpc(error: unknown): never {
  if (error instanceof OtpRateLimited) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: error.message })
  }
  if (error instanceof UnderageError || error instanceof InvalidDateOfBirth) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message })
  }
  if (error instanceof TRPCError) throw error
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: error instanceof Error ? error.message : "Request failed",
  })
}

const pingSchema = healthSchema

/** Lightweight probes for middleware integration tests and ops checks. */
const accessRouter = t.router({
  authedPing: authedProcedure.output(pingSchema).query(() => ({ ok: true as const })),
  talentPing: talentProcedure.output(pingSchema).query(() => ({ ok: true as const })),
  bookerPing: bookerProcedure.output(pingSchema).query(() => ({ ok: true as const })),
  verifiedBookerPing: verifiedBookerProcedure
    .output(pingSchema)
    .query(() => ({ ok: true as const })),
  adminPing: adminProcedure.output(pingSchema).query(() => ({ ok: true as const })),
})

const authRouter = t.router({
  requestOtp: publicProcedure.input(requestOtpInput).mutation(async ({ ctx, input }) => {
    try {
      assertAdult(input.dateOfBirth)
      otpLimiter.consume(input.email, ctx.ip)
      await ctx.auth.requestOtp(input.email)
      return { ok: true as const }
    } catch (error) {
      asTrpc(error)
    }
  }),

  verifyOtp: publicProcedure
    .input(verifyOtpInput)
    .output(sessionSchema)
    .mutation(async ({ ctx, input }) => {
      try {
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
      } catch (error) {
        asTrpc(error)
      }
    }),

  refresh: publicProcedure
    .input(refreshInput)
    .output(sessionSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const session = await ctx.auth.refresh(input.refreshToken)
        return {
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          expiresIn: session.expiresIn,
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error
        throw new TRPCError({ code: "UNAUTHORIZED" })
      }
    }),

  me: authedProcedure.output(meSchema).query(async ({ ctx }) => {
    const me = await readMe(ctx.db, ctx.userId)
    if (!me) throw new TRPCError({ code: "UNAUTHORIZED" })
    return me
  }),

  enableMode: authedProcedure.input(enableModeInput).mutation(async ({ ctx, input }) => {
    const modes = await enableUserMode(ctx.db, ctx.userId, input.mode)
    return { modes }
  }),
})

export const appRouter = t.router({
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
