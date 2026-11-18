import { z } from "zod"

import { projectTypeSchema } from "./booker"

/**
 * The brief a booker attached to a match: what the talent reads to see the opportunity, not just
 * "hi" (M6 6.4). A copy taken when it was attached. It carries the offer — role, project, the
 * written brief, shoot window, rate range — and never the role's `requirements`, which can hold
 * sensitive-tier attributes.
 */
export const matchBriefSchema = z.object({
  roleId: z.uuid(),
  roleName: z.string(),
  projectName: z.string(),
  projectType: projectTypeSchema.nullable(),
  brief: z.string(),
  shootStartsOn: z.string().nullable(),
  shootEndsOn: z.string().nullable(),
  rateMin: z.number().nullable(),
  rateMax: z.number().nullable(),
  rateCurrency: z.string(),
})

export const matchSchema = z.object({
  id: z.uuid(),
  conversationId: z.uuid(),
  /** The role the interest was for, if it named one. */
  roleId: z.uuid().nullable(),
  createdAt: z.string(),
  /** Null until the booker attaches one. */
  brief: matchBriefSchema.nullable(),
  briefAttachedAt: z.string().nullable(),
})

export const matchIdInput = z.object({ matchId: z.uuid() })

export const attachBriefInput = z.object({
  matchId: z.uuid(),
  /**
   * Which of the booker's roles to attach. Defaults to the role the interest was for; required
   * when the interest named none.
   */
  roleId: z.uuid().optional(),
})

export type MatchBrief = z.infer<typeof matchBriefSchema>
export type Match = z.infer<typeof matchSchema>
