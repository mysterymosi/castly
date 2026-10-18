import { captureTrpcError, initApiSentry } from "./observability/sentry.js"
import "./db.js"
import { serve } from "@hono/node-server"
import { trpcServer } from "@hono/trpc-server"
import { Hono } from "hono"

import { db } from "./db.js"
import { handleSendSms } from "./hooks/send-sms.js"
import {
  handleMuxVideoWebhook,
  verifyMuxWebhookSignature,
} from "./media/mux-webhook.js"
import { handleLocalMediaUpload } from "./media/local-upload.js"
import { applyMediaReadyEvent } from "./media/service.js"
import { verifyMediaProviderWebhook } from "./media/webhook.js"
import { createContext, type Context } from "./trpc/context.js"
import { appRouter } from "./trpc/router.js"

initApiSentry()

const app = new Hono()

app.get("/health", (c) => c.json({ ok: true }))

app.post("/hooks/media/provider", async (c) => {
  const raw = await c.req.text()
  const headers = Object.fromEntries(c.req.raw.headers)
  try {
    const event = verifyMediaProviderWebhook(raw, headers)
    await applyMediaReadyEvent(db, event)
    return c.json({ ok: true })
  } catch (error) {
    console.error("media provider webhook failed", error instanceof Error ? error.message : "unknown")
    return c.json({ error: "webhook_rejected" }, 401)
  }
})

app.post("/hooks/mux", async (c) => {
  const raw = await c.req.text()
  const secret = process.env.MUX_WEBHOOK_SECRET
  if (!secret) return c.json({ error: "not_configured" }, 503)
  try {
    verifyMuxWebhookSignature(raw, c.req.header("Mux-Signature"), secret)
    await handleMuxVideoWebhook(db, raw)
    return c.json({ ok: true })
  } catch (error) {
    console.error("mux webhook failed", error instanceof Error ? error.message : "unknown")
    return c.json({ error: "webhook_rejected" }, 401)
  }
})

app.post("/hooks/media/upload/:tokenId", async (c) => {
  const tokenId = c.req.param("tokenId")
  const secret = c.req.query("secret")
  if (!secret) return c.json({ error: "missing_secret" }, 400)
  const contentType = c.req.header("content-type") ?? ""
  const kindHint = contentType.startsWith("video/") ? "video" : "image"
  try {
    const body = Buffer.from(await c.req.arrayBuffer())
    await handleLocalMediaUpload(db, tokenId, secret, body, kindHint)
    return c.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "upload_failed"
    const status =
      message.includes("already used") || message.includes("consumed") ? 409 : 400
    return c.json({ error: message }, status)
  }
})

app.post("/hooks/send-sms", async (c) => {
  const raw = await c.req.text()
  const headers = Object.fromEntries(c.req.raw.headers)
  try {
    await handleSendSms(raw, headers)
    return c.json({})
  } catch (error) {
    console.error("send-sms hook failed", error instanceof Error ? error.message : "unknown")
    return c.json({ error: "sms_failed" }, 500)
  }
})

app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    createContext: ({ req }) => createContext(req),
    onError({ error, path, ctx }) {
      const requestCtx = ctx as Context | undefined
      if (!requestCtx?.requestId) return
      captureTrpcError(error, {
        requestId: requestCtx.requestId,
        path,
        userId: requestCtx.userId,
      })
    },
  }),
)

const port = Number(process.env.PORT ?? 3001)

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`api listening on ${info.port}`)
})
