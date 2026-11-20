import { TRPCError } from "@trpc/server"
import { schema } from "@workspace/db"
import { and, eq, sql } from "drizzle-orm"
import { z } from "zod"

import { authedProcedure, router } from "../trpc/trpc.js"
import { categories, defaultPreference } from "./events.js"

const tokenSchema = z
  .string()
  .max(256)
  .regex(/^(?:Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$/)
const preferenceSchema = z
  .object({
    category: z.enum(categories),
    enabled: z.boolean(),
    cadence: z.enum(schema.notificationCadence.enumValues),
    frequencyCap: z.number().int().min(1).max(1000).nullable(),
  })
  .refine(
    ({ category, cadence }) => cadence !== "weekly" || category === "brief",
    {
      path: ["cadence"],
      message: "Weekly digest is available for briefs",
    }
  )

const { deviceTokens, notificationPrefs } = schema

function deviceWriteFailed(): never {
  // Drizzle errors include bound parameters. Keep the raw Expo token out of logs and traces.
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Could not update the push registration",
  })
}

export const notificationRouter = router({
  registerDevice: authedProcedure
    .input(
      z.object({
        token: tokenSchema,
        platform: z.enum(schema.devicePlatform.enumValues),
        previousToken: tokenSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { token, platform, previousToken } = input
      const update = ctx.db.transaction(async (tx) => {
        await tx
          .insert(deviceTokens)
          .values({ userId: ctx.userId, token, platform })
          .onConflictDoUpdate({
            target: deviceTokens.token,
            set: {
              userId: ctx.userId,
              platform,
              lastSeenAt: sql`now()`,
              // Jobs targeting that token's previous owner must not survive a transfer.
              id: sql`case when ${deviceTokens.userId} <> ${ctx.userId} then uuid_generate_v7() else ${deviceTokens.id} end`,
            },
          })
        if (previousToken && previousToken !== token) {
          await tx
            .delete(deviceTokens)
            .where(
              and(
                eq(deviceTokens.userId, ctx.userId),
                eq(deviceTokens.token, previousToken)
              )
            )
        }
      })
      await update.catch(deviceWriteFailed)
      return { ok: true as const }
    }),
  unregisterDevice: authedProcedure
    .input(z.object({ token: tokenSchema }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(deviceTokens)
        .where(
          and(
            eq(deviceTokens.userId, ctx.userId),
            eq(deviceTokens.token, input.token)
          )
        )
        .catch(deviceWriteFailed)
      return { ok: true as const }
    }),
  preferences: authedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        category: notificationPrefs.category,
        enabled: notificationPrefs.enabled,
        cadence: notificationPrefs.cadence,
        frequencyCap: notificationPrefs.frequencyCap,
      })
      .from(notificationPrefs)
      .where(eq(notificationPrefs.userId, ctx.userId))
    return categories.map(
      (category) =>
        rows.find((row) => row.category === category) ??
        defaultPreference(category)
    )
  }),
  setPreference: authedProcedure
    .input(preferenceSchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(notificationPrefs)
        .values({ userId: ctx.userId, ...input })
        .onConflictDoUpdate({
          target: [notificationPrefs.userId, notificationPrefs.category],
          set: {
            enabled: input.enabled,
            cadence: input.cadence,
            frequencyCap: input.frequencyCap,
          },
        })
      return input
    }),
})
