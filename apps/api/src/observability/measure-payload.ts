import { gzipSync } from "node:zlib"

import type { MiddlewareHandler } from "hono"

/** Procedures whose response size is logged for the M2 2.10 device measurement. */
const measuredProcedures = ["talent.studio.get"]

/**
 * Logs `[measure] payload {...}` with raw and gzipped byte sizes for measured tRPC responses.
 * Enabled with MEASURE_PAYLOAD=1; a pass-through otherwise.
 */
export function measurePayload(): MiddlewareHandler {
  const enabled = process.env.MEASURE_PAYLOAD === "1"
  return async (c, next) => {
    await next()
    if (!enabled) return
    const procedure = measuredProcedures.find((name) =>
      c.req.path.includes(name)
    )
    if (!procedure) return
    const body = Buffer.from(await c.res.clone().arrayBuffer())
    console.log(
      `[measure] payload ${JSON.stringify({
        procedure,
        path: c.req.path,
        status: c.res.status,
        rawBytes: body.byteLength,
        gzipBytes: gzipSync(body).byteLength,
      })}`
    )
  }
}
