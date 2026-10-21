import { eq } from "drizzle-orm"
import { TRPCError } from "@trpc/server"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { schema } from "@workspace/db"

import { AuthRejected, INVALID_OTP_MESSAGE, type AuthClient } from "./supabase.js"
import { otpLimiter } from "./rate-limit.js"
import { db } from "../db.js"
import { deleteAuthUser, seedAuthUser } from "../test/seed-auth-user.js"
import { appRouter } from "../trpc/router.js"

const adult = "1990-01-01"
const otherAdult = "1988-04-04"
const child = "2015-01-01"

function rejection(error: unknown) {
  if (!(error instanceof TRPCError)) throw error
  return { code: error.code, message: error.message }
}

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
  const seededUserIds: string[] = []

  beforeEach(() => {
    otpLimiter.reset()
  })

  afterEach(async () => {
    while (seededUserIds.length > 0) {
      const id = seededUserIds.pop()
      if (id) await deleteAuthUser(id)
    }
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

  it("returns success for an unknown sign-in email without sending a code", async () => {
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
      caller(auth).auth.requestOtp({ email: "missing-signin@example.com" }),
    ).resolves.toEqual({ ok: true })
    expect(called).toBe(false)
  })

  it("returns the same payload for a known and an unknown sign-in email", async () => {
    const userId = await seedAuthUser("same-payload", adult)
    seededUserIds.push(userId)
    const auth: AuthClient = {
      requestOtp: async () => {},
      verifyOtp: async () => {
        throw new Error("unused")
      },
      refresh: async () => {
        throw new Error("unused")
      },
    }
    const api = caller(auth, "203.0.113.61")
    const known = await api.auth.requestOtp({
      email: "middleware-same-payload@example.com",
    })
    const unknown = await api.auth.requestOtp({ email: "nobody-same-payload@example.com" })
    expect(known).toEqual(unknown)
    expect(known).toEqual({ ok: true })
  })

  it("rejects an unknown sign-in code the same way as a wrong code", async () => {
    const userId = await seedAuthUser("wrong-code", adult)
    seededUserIds.push(userId)
    let verifyCalls = 0
    const auth: AuthClient = {
      requestOtp: async () => {
        throw new Error("unused")
      },
      verifyOtp: async () => {
        verifyCalls += 1
        throw new AuthRejected(INVALID_OTP_MESSAGE)
      },
      refresh: async () => {
        throw new Error("unused")
      },
    }
    const api = caller(auth, "203.0.113.62")
    const known = await api.auth
      .verifyOtp({ email: "middleware-wrong-code@example.com", token: "000000" })
      .then(() => null, rejection)
    const callsAfterKnown = verifyCalls
    const unknown = await api.auth
      .verifyOtp({ email: "nobody-wrong-code@example.com", token: "000000" })
      .then(() => null, rejection)
    expect(unknown).toEqual(known)
    expect(unknown).toEqual({ code: "UNAUTHORIZED", message: INVALID_OTP_MESSAGE })
    expect(callsAfterKnown).toBe(1)
    expect(verifyCalls).toBe(1)
  })

  it("does not overwrite a stored birthday when an existing email signs up", async () => {
    const userId = await seedAuthUser("signup-existing", adult)
    seededUserIds.push(userId)
    const auth: AuthClient = {
      requestOtp: async () => {
        throw new Error("unused")
      },
      verifyOtp: async () => ({
        accessToken: "access",
        refreshToken: "refresh",
        expiresIn: 3600,
        userId,
        email: "middleware-signup-existing@example.com",
      }),
      refresh: async () => {
        throw new Error("unused")
      },
    }
    await caller(auth, "203.0.113.63").auth.verifyOtp({
      email: "middleware-signup-existing@example.com",
      token: "123456",
      dateOfBirth: otherAdult,
    })
    const [user] = await db
      .select({ dateOfBirth: schema.users.dateOfBirth })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
    expect(user?.dateOfBirth).toBe(adult)
  })

  it("consumes a rate-limit slot for an unknown sign-in email", async () => {
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
    const api = caller(auth, "203.0.113.64")
    await expect(
      api.auth.requestOtp({ email: "unknown-limit@example.com" }),
    ).resolves.toEqual({ ok: true })
    expect(called).toBe(false)
    await expect(
      api.auth.requestOtp({ email: "unknown-limit@example.com" }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" } satisfies Partial<TRPCError>)
  })

  it("sends a code for an existing account without a date of birth", async () => {
    const userId = await seedAuthUser("signin-otp", adult)
    seededUserIds.push(userId)
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
    await caller(auth).auth.requestOtp({ email: "middleware-signin-otp@example.com" })
    expect(called).toBe(true)
  })

  it("keeps the stored birthday when an existing account verifies without one", async () => {
    const userId = await seedAuthUser("signin-verify", adult)
    seededUserIds.push(userId)
    const auth: AuthClient = {
      requestOtp: async () => {
        throw new Error("unused")
      },
      verifyOtp: async () => ({
        accessToken: "access",
        refreshToken: "refresh",
        expiresIn: 3600,
        userId,
        email: "middleware-signin-verify@example.com",
      }),
      refresh: async () => {
        throw new Error("unused")
      },
    }
    await caller(auth).auth.verifyOtp({
      email: "middleware-signin-verify@example.com",
      token: "123456",
    })
    const [user] = await db
      .select({ dateOfBirth: schema.users.dateOfBirth })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
    expect(user?.dateOfBirth).toBe(adult)
  })
})
