import { randomUUID } from "node:crypto"

import { TRPCError } from "@trpc/server"
import { db } from "../db.js"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { AuthClient } from "../auth/supabase.js"
import { deleteAuthUser, seedAuthUser } from "../test/seed-auth-user.js"
import { appRouter } from "./router.js"

const adult = "1990-01-01"
const seededUserIds: string[] = []

const stubAuth: AuthClient = {
  requestOtp: async () => {},
  verifyOtp: async () => {
    throw new Error("unused")
  },
  refresh: async () => {
    throw new Error("unused")
  },
}

function authedCaller(userId: string, requestId = "integration-test") {
  return appRouter.createCaller({
    db,
    ip: "203.0.113.80",
    requestId,
    authorization: "Bearer test-token",
    auth: stubAuth,
    verifyAccessToken: async () => ({ userId }),
  })
}

describe("tRPC middleware ladder", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(async () => {
    while (seededUserIds.length > 0) {
      const id = seededUserIds.pop()
      if (id) await deleteAuthUser(id)
    }
  })

  it("rejects unauthenticated access to authed procedures", async () => {
    const api = appRouter.createCaller({
      db,
      ip: "203.0.113.81",
      requestId: "no-auth",
      authorization: null,
      auth: stubAuth,
      verifyAccessToken: async () => {
        throw new Error("no token")
      },
    })
    await expect(api.access.authedPing()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    } satisfies Partial<TRPCError>)
  })

  it("blocks booker procedures when the user only has talent mode", async () => {
    const userId = await seedAuthUser("talent-only", adult)
    seededUserIds.push(userId)
    const api = authedCaller(userId)
    await api.auth.enableMode({ mode: "talent" })
    await expect(api.access.bookerPing()).rejects.toMatchObject({
      code: "FORBIDDEN",
    } satisfies Partial<TRPCError>)
  })

  it("allows booker procedures after enableMode('booker')", async () => {
    const userId = await seedAuthUser("booker-enabled", adult)
    seededUserIds.push(userId)
    const api = authedCaller(userId)
    await api.auth.enableMode({ mode: "booker" })
    await expect(api.access.bookerPing()).resolves.toEqual({ ok: true })
    await expect(api.access.verifiedBookerPing()).resolves.toEqual({ ok: true })
  })

  it("includes the request id in structured api logs", async () => {
    const lines: string[] = []
    vi.spyOn(console, "log").mockImplementation((line) => {
      lines.push(String(line))
    })
    const api = appRouter.createCaller({
      db,
      ip: "203.0.113.82",
      requestId: "client-req-abc",
      authorization: null,
      auth: stubAuth,
      verifyAccessToken: async () => ({ userId: randomUUID() }),
    })
    await api.health()
    const entry = lines.map((line) => JSON.parse(line) as { requestId?: string; path?: string }).find(
      (row) => row.path === "health",
    )
    expect(entry?.requestId).toBe("client-req-abc")
  })
})
