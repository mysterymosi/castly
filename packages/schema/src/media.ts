import { z } from "zod"

export const mediaKindInputSchema = z.enum(["image", "video"])

export const createUploadUrlInput = z.object({
  kind: mediaKindInputSchema,
  contentType: z.string().min(3).max(120),
  byteSize: z.number().int().positive().max(512 * 1024 * 1024).optional(),
})

export const mediaUploadMethodSchema = z.enum(["POST", "TUS", "PUT"])

export const createUploadUrlOutput = z.object({
  mediaId: z.uuid(),
  uploadUrl: z.url(),
  uploadMethod: mediaUploadMethodSchema,
  /** Extra headers for tus or authenticated POST uploads. */
  uploadHeaders: z.record(z.string(), z.string()).default({}),
  expiresAt: z.string(),
})

export const imageVariantSchema = z.enum(["card", "thumb", "full", "og"])

export const mediaImageVariantsSchema = z.object({
  card: z.url(),
  thumb: z.url(),
  full: z.url(),
  og: z.url(),
})

export const mediaStatusOutput = z.object({
  id: z.uuid(),
  kind: z.enum(["image", "video", "audio", "document"]),
  status: z.enum(["pending", "processing", "ready", "failed", "quarantined"]),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  durationMs: z.number().int().nullable(),
  posterUrl: z.url().nullable(),
  playbackUrl: z.url().nullable(),
  blurhash: z.string().nullable(),
  variants: mediaImageVariantsSchema.nullable(),
})

export const mediaStatusInput = z.object({
  mediaId: z.uuid(),
})

export const deleteMediaInput = z.object({
  mediaId: z.uuid(),
})

export const deleteMediaOutput = z.object({
  ok: z.literal(true),
})

export type CreateUploadUrlInput = z.infer<typeof createUploadUrlInput>
export type CreateUploadUrlOutput = z.infer<typeof createUploadUrlOutput>
export type MediaStatusOutput = z.infer<typeof mediaStatusOutput>
