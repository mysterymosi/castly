import { z } from "zod"

import { bookerVerticalSchema, projectTypeSchema, verificationTierSchema } from "./booker"

/** Mirrors the `interest_status` enum. */
export const interestStatuses = ["pending", "accepted", "declined", "expired"] as const
export const interestStatusSchema = z.enum(interestStatuses)

/** One pending interest in a talent's incoming list (PRD §6.3). */
export const incomingInterestSchema = z.object({
  id: z.uuid(),
  createdAt: z.string(),
  expiresAt: z.string(),
  /** Who is asking. Verification is shown so the talent can weigh the approach (PRD §7.6). */
  booker: z.object({
    vertical: bookerVerticalSchema,
    companyName: z.string().nullable(),
    verificationTier: verificationTierSchema,
  }),
  /** Set when the swipe carried a role; the project is the context the talent reads first. */
  role: z
    .object({
      id: z.uuid(),
      name: z.string(),
      projectName: z.string(),
      projectType: projectTypeSchema.nullable(),
    })
    .nullable(),
  /** The same words push and SMS use: "A casting director is interested in you for Lagos Nights". */
  headline: z.string(),
})

export const incomingInterestsSchema = z.object({
  interests: z.array(incomingInterestSchema),
  /** The talent's auto-accept setting, shown beside the list it affects. */
  autoAccept: z.boolean(),
})

export const interestIdInput = z.object({ interestId: z.uuid() })

export const interestAcceptResultSchema = z.object({
  interestId: z.uuid(),
  matchId: z.uuid(),
})

export const interestDeclineResultSchema = z.object({
  interestId: z.uuid(),
  status: z.literal("declined"),
})

export const setAutoAcceptInput = z.object({ enabled: z.boolean() })

export const autoAcceptSchema = z.object({ autoAccept: z.boolean() })

export type IncomingInterest = z.infer<typeof incomingInterestSchema>
export type IncomingInterests = z.infer<typeof incomingInterestsSchema>
