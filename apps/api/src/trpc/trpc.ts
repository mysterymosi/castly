import { initTRPC, TRPCError } from "@trpc/server"

import { listModes } from "../auth/users.js"
import type { Context } from "./context.js"
import { logApiEvent } from "./log.js"

const t = initTRPC.context<Context>().create()

const requestLogMiddleware = t.middleware(async ({ ctx, next, path, type }) => {
  const start = Date.now()
  try {
    const result = await next()
    logApiEvent({
      level: "info",
      requestId: ctx.requestId,
      path,
      type,
      ok: true,
      ms: Date.now() - start,
      userId: ctx.userId,
    })
    return result
  } catch (error) {
    logApiEvent({
      level: "info",
      requestId: ctx.requestId,
      path,
      type,
      ok: false,
      ms: Date.now() - start,
      userId: ctx.userId,
      error: error instanceof Error ? error.message : "unknown",
    })
    throw error
  }
})

async function resolveUser(ctx: Context) {
  const token = ctx.authorization?.startsWith("Bearer ")
    ? ctx.authorization.slice("Bearer ".length)
    : null
  if (!token) throw new TRPCError({ code: "UNAUTHORIZED" })
  try {
    return await ctx.verifyAccessToken(token)
  } catch {
    throw new TRPCError({ code: "UNAUTHORIZED" })
  }
}

const authedMiddleware = t.middleware(async ({ ctx, next }) => {
  const { userId } = await resolveUser(ctx)
  return next({ ctx: { userId } })
})

type AppMode = "talent" | "booker" | "admin"

function requireMode(mode: AppMode) {
  return t.middleware(async ({ ctx, next }) => {
    const userId = ctx.userId
    if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" })
    const modes = await listModes(ctx.db, userId)
    if (!modes.includes(mode)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `This action requires ${mode} mode`,
      })
    }
    return next()
  })
}

export const publicProcedure = t.procedure.use(requestLogMiddleware)
export const authedProcedure = publicProcedure.use(authedMiddleware)
export const talentProcedure = authedProcedure.use(requireMode("talent"))
export const bookerProcedure = authedProcedure.use(requireMode("booker"))
/**
 * Stub for M7 (Smile ID / professional verification). Same gate as `booker` until
 * verification status is enforced server-side.
 */
export const verifiedBookerProcedure = bookerProcedure
export const adminProcedure = authedProcedure.use(requireMode("admin"))

export { t }
