import {
  messageListInput,
  messageListSchema,
  messageMarkReadInput,
  messageMarkReadSchema,
  messageSchema,
  messageSendInput,
} from "@workspace/schema"

import { callProcedure } from "../trpc/errors.js"
import { authedProcedure, router } from "../trpc/trpc.js"
import { listMessages, markRead, sendMessage } from "./service.js"

/**
 * Chat (TECH_SPEC §6 `message`, §13). Open to either side of a conversation — membership, not
 * mode, decides — and every procedure checks it. Writes happen here only; live reads come over
 * Realtime, and `list` stays the source of truth if Realtime lags or drops.
 */
export const messageRouter = router({
  list: authedProcedure
    .input(messageListInput)
    .output(messageListSchema)
    .query(({ ctx, input }) => callProcedure(() => listMessages(ctx.db, ctx.userId, input))),

  send: authedProcedure
    .input(messageSendInput)
    .output(messageSchema)
    .mutation(({ ctx, input }) => callProcedure(() => sendMessage(ctx.db, ctx.userId, input))),

  markRead: authedProcedure
    .input(messageMarkReadInput)
    .output(messageMarkReadSchema)
    .mutation(({ ctx, input }) => callProcedure(() => markRead(ctx.db, ctx.userId, input.conversationId, input.messageId))),
})
