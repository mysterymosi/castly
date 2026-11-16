import {
  createUploadUrlInput,
  createUploadUrlOutput,
  deleteMediaInput,
  deleteMediaOutput,
  mediaStatusInput,
  mediaStatusOutput,
} from "@workspace/schema"

import { callProcedure } from "../trpc/errors.js"
import { router, authedProcedure } from "../trpc/trpc.js"
import { createUploadUrl, deleteMedia, getMediaStatus } from "./service.js"

/**
 * Uploads are open to any signed-in user: talents for their portfolio, either side of a chat for
 * media messages. Every procedure acts only on the caller's own media (`loadOwnedMedia`).
 */
export const mediaRouter = router({
  createUploadUrl: authedProcedure
    .input(createUploadUrlInput)
    .output(createUploadUrlOutput)
    .mutation(({ ctx, input }) => {
      return callProcedure(() => createUploadUrl(ctx.db, ctx.userId, input))
    }),

  status: authedProcedure
    .input(mediaStatusInput)
    .output(mediaStatusOutput)
    .query(({ ctx, input }) => {
      return callProcedure(() => getMediaStatus(ctx.db, ctx.userId, input.mediaId))
    }),

  delete: authedProcedure
    .input(deleteMediaInput)
    .output(deleteMediaOutput)
    .mutation(({ ctx, input }) => {
      return callProcedure(() => deleteMedia(ctx.db, ctx.userId, input.mediaId))
    }),
})
