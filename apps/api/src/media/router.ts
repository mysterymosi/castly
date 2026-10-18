import {
  createUploadUrlInput,
  createUploadUrlOutput,
  deleteMediaInput,
  deleteMediaOutput,
  mediaStatusInput,
  mediaStatusOutput,
} from "@workspace/schema"

import { callProcedure } from "../trpc/errors.js"
import { router, talentProcedure } from "../trpc/trpc.js"
import { createUploadUrl, deleteMedia, getMediaStatus } from "./service.js"

export const mediaRouter = router({
  createUploadUrl: talentProcedure
    .input(createUploadUrlInput)
    .output(createUploadUrlOutput)
    .mutation(({ ctx, input }) => {
      return callProcedure(() => createUploadUrl(ctx.db, ctx.userId, input))
    }),

  status: talentProcedure
    .input(mediaStatusInput)
    .output(mediaStatusOutput)
    .query(({ ctx, input }) => {
      return callProcedure(() => getMediaStatus(ctx.db, ctx.userId, input.mediaId))
    }),

  delete: talentProcedure
    .input(deleteMediaInput)
    .output(deleteMediaOutput)
    .mutation(({ ctx, input }) => {
      return callProcedure(() => deleteMedia(ctx.db, ctx.userId, input.mediaId))
    }),
})
