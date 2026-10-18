import { z } from "zod"

export * from "./portfolio/index"
export * from "./talent/studio"
export * from "./media"

export const healthSchema = z.object({
  ok: z.literal(true),
})

export type Health = z.infer<typeof healthSchema>

export const dateOfBirthSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email())
export const phoneSchema = z.string().trim().min(10).max(16)
export const otpSchema = z.string().regex(/^\d{6}$/)
export const clientModeSchema = z.enum(["talent", "booker"])

export const requestOtpInput = z.object({
  email: emailSchema,
  dateOfBirth: dateOfBirthSchema,
})

export const verifyOtpInput = requestOtpInput.extend({
  token: otpSchema,
})

export const refreshInput = z.object({
  refreshToken: z.string().min(1),
})

export const enableModeInput = z.object({
  mode: clientModeSchema,
})

export const sessionSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
})

export const meSchema = z.object({
  id: z.uuid(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  dateOfBirth: z.string().nullable(),
  modes: z.array(z.enum(["talent", "booker", "admin"])),
})

export type Session = z.infer<typeof sessionSchema>
export type Me = z.infer<typeof meSchema>
