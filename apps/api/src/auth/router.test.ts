import { TRPCError } from "@trpc/server"
import { beforeEach, describe, expect, it } from "vitest"

import type { AuthClient } from "./supabase.js"
import { otpLimiter } from "./rate-limit.js"
import { db } from "../db.js"
import { appRouter } from "../trpc/router.js"

const adult = "1990-01-01"
const child = "2015-01-01"

function caller(auth: AuthClient, ip = "203.0.113.50") {
  return appRouter.createCaller({
    db,
    ip,
    requestId: "auth-router-test",
    authorization: null,
    auth,
    verifyAccessToken: async () => {
      throw new Error("no token in this test")
    },
  })
}

describe("auth.requestOtp", () => {
  beforeEach(() => {
    otpLimiter.reset()
  })

  it("rejects an under-18 date of birth before asking Supabase for a code", async () => {
    let called = false
    const auth: AuthClient = {
      requestOtp: async () => {
        called = true
      },
      verifyOtp: async () => {
        throw new Error("unused")
      },
      refresh: async () => {
        throw new Error("unused")
      },
    }
    await expect(
      caller(auth).auth.requestOtp({ email: "ada@example.com", dateOfBirth: child }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } satisfies Partial<TRPCError>)
    expect(called).toBe(false)
  })

  it("rate-limits a second request for the same email", async () => {
    const auth: AuthClient = {
      requestOtp: async () => {},
      verifyOtp: async () => {
        throw new Error("unused")
      },
      refresh: async () => {
        throw new Error("unused")
      },
    }
    const api = caller(auth, "203.0.113.60")
    await api.auth.requestOtp({ email: "ada@example.com", dateOfBirth: adult })
    await expect(
      api.auth.requestOtp({ email: "ada@example.com", dateOfBirth: adult }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" } satisfies Partial<TRPCError>)
  })
})
