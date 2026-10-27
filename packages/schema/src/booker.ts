import { z } from "zod"

/** PRD §6.2 "what kind of work do you do?". Mirrors the `booker_vertical` enum. */
export const bookerVerticals = [
  "casting_director",
  "producer",
  "director",
  "brand_or_agency",
  "event_planner",
  "photographer",
  "content_creator",
  "other",
] as const

export const bookerVerticalLabels: Record<(typeof bookerVerticals)[number], string> = {
  casting_director: "Casting director",
  producer: "Producer",
  director: "Director",
  brand_or_agency: "Brand or agency",
  event_planner: "Event planner",
  photographer: "Photographer",
  content_creator: "Content creator",
  other: "Other",
}

/** Mirrors the `project_type` enum. */
export const projectTypes = [
  "film",
  "tv",
  "commercial",
  "music_video",
  "theatre",
  "campaign",
  "event",
  "photoshoot",
  "content",
  "other",
] as const

export const projectTypeLabels: Record<(typeof projectTypes)[number], string> = {
  film: "Film",
  tv: "TV & streaming",
  commercial: "Commercials",
  music_video: "Music videos",
  theatre: "Theatre",
  campaign: "Campaigns",
  event: "Events",
  photoshoot: "Photoshoots",
  content: "Online content",
  other: "Other",
}

export const verificationTiers = ["phone", "id", "professional"] as const

export const bookerVerticalSchema = z.enum(bookerVerticals)
export const projectTypeSchema = z.enum(projectTypes)
export const verificationTierSchema = z.enum(verificationTiers)

export const bookerProfileSchema = z.object({
  userId: z.uuid(),
  vertical: bookerVerticalSchema,
  companyName: z.string().nullable(),
  cityId: z.uuid().nullable(),
  cityName: z.string().nullable(),
  typicalProjectTypes: z.array(projectTypeSchema),
  verificationTier: verificationTierSchema,
  /** ISO time the booker asked to be verified; the review itself is M7. */
  verificationRequestedAt: z.string().nullable(),
})

/** `booker.getProfile`: the profile (null until setup is finished) and the cities to pick from. */
export const bookerProfileStateSchema = z.object({
  profile: bookerProfileSchema.nullable(),
  cities: z.array(z.object({ id: z.uuid(), name: z.string(), slug: z.string() })),
})

/** Full replace of the profile: the setup flow and later edits send every field. */
export const updateBookerProfileInput = z.object({
  vertical: bookerVerticalSchema,
  /** Blank means "no company". */
  companyName: z
    .string()
    .trim()
    .max(120)
    .nullable()
    .transform((value) => (value ? value : null)),
  cityId: z.uuid(),
  typicalProjectTypes: z
    .array(projectTypeSchema)
    .min(1)
    .max(projectTypes.length)
    .refine((types) => new Set(types).size === types.length, "Project types must be unique"),
})

export type BookerVertical = z.infer<typeof bookerVerticalSchema>
export type ProjectType = z.infer<typeof projectTypeSchema>
export type BookerProfile = z.infer<typeof bookerProfileSchema>
export type BookerProfileState = z.infer<typeof bookerProfileStateSchema>
export type UpdateBookerProfileInput = z.input<typeof updateBookerProfileInput>
