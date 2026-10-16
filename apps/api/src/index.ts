import { captureTrpcError, initApiSentry } from "./observability/sentry.js"
import "./db.js"
import { serve } from "@hono/node-server"
import { trpcServer } from "@hono/trpc-server"
import { Hono } from "hono"

import { handleSendSms } from "./hooks/send-sms.js"
import { createContext, type Context } from "./trpc/context.js"
import { appRouter } from "./trpc/router.js"

initApiSentry()

const app = new Hono()

app.get("/health", (c) => c.json({ ok: true }))

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
