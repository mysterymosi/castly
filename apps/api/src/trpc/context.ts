import { randomUUID } from "node:crypto"

import type { Db } from "@workspace/db"

import { verifyAccessToken } from "../auth/jwt.js"
import { supabaseAuth, type AuthClient } from "../auth/supabase.js"
import { db } from "../db.js"

export type Context = {
  db: Db
  ip: string
  requestId: string
  authorization: string | null
  /** `x-castly-web-key`: identifies the web app's server so it gets its own rate-limit bucket. */
  webKey?: string | null
  auth: AuthClient
  verifyAccessToken: typeof verifyAccessToken
  userId?: string
}

export function clientIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for")
  const first = forwarded?.split(",")[0]?.trim()
  return first || "unknown"
}

function requestIdFrom(req: Request) {
  const fromClient = req.headers.get("x-request-id")?.trim()
  if (fromClient && fromClient.length > 0 && fromClient.length <= 128) return fromClient
  return randomUUID()
}

export function createContext(req: Request): Context {
  return {
    db,
    ip: clientIp(req),
    requestId: requestIdFrom(req),
    authorization: req.headers.get("authorization"),
    webKey: req.headers.get("x-castly-web-key"),
    auth: supabaseAuth,
    verifyAccessToken,
  }
}
