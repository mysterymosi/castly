import { z } from "zod"

import { mediaStatusOutput } from "./media"

/** The longest a message body may be. Mirrors the `messages_body_length` check. */
export const MESSAGE_BODY_MAX = 4000

/** Mirrors the `message_kind` enum. */
export const messageKinds = ["text", "image", "video", "audio", "document"] as const
export const messageKindSchema = z.enum(messageKinds)

/**
 * What `message.send` accepts today: text, and images and video through the media pipeline.
 * Audio and document are in the database enum but wait on a private upload and download path —
 * the pipeline's buckets are public-read, which is wrong for a script or a brief.
 */
export const sendableMessageKindSchema = z.enum(["text", "image", "video"])

export const messageSchema = z.object({
  id: z.uuid(),
  conversationId: z.uuid(),
  senderId: z.uuid(),
  kind: messageKindSchema,
  /** The text, or a media message's caption. */
  body: z.string().nullable(),
  media: mediaStatusOutput.nullable(),
  createdAt: z.string(),
})

export const messageSendInput = z
  .object({
    conversationId: z.uuid(),
    kind: sendableMessageKindSchema.default("text"),
    body: z
      .string()
      .trim()
      .max(MESSAGE_BODY_MAX)
      .optional()
      .transform((body) => body || undefined),
    /** A ready upload of the sender's own, for an image or video message. */
    mediaId: z.uuid().optional(),
    /**
     * Chosen by the client per message and reused on a retry, so a send repeated over a bad
     * connection posts once.
     */
    clientId: z.uuid().optional(),
  })
  .superRefine((input, ctx) => {
    if (input.kind === "text") {
      if (!input.body) ctx.addIssue({ code: "custom", path: ["body"], message: "A message needs text" })
      if (input.mediaId) ctx.addIssue({ code: "custom", path: ["mediaId"], message: "A text message has no media" })
    } else if (!input.mediaId) {
      ctx.addIssue({ code: "custom", path: ["mediaId"], message: `A ${input.kind} message needs its media` })
    }
  })

export const messageListInput = z.object({
  conversationId: z.uuid(),
  /** The `nextCursor` of the page before; omitted for the newest messages. */
  cursor: z.uuid().optional(),
  limit: z.number().int().min(1).max(50).default(30),
})

/** Newest first. `nextCursor` is null on the last page. */
export const messageListSchema = z.object({
  messages: z.array(messageSchema),
  nextCursor: z.uuid().nullable(),
})

export const messageMarkReadInput = z.object({ conversationId: z.uuid() })

export const messageMarkReadSchema = z.object({ lastReadAt: z.string() })

export type Message = z.infer<typeof messageSchema>
export type MessageSendInput = z.output<typeof messageSendInput>
