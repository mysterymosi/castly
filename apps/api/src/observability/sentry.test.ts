import { TRPCError } from "@trpc/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const sentryMocks = vi.hoisted(() => ({
  setTag: vi.fn(),
  setUser: vi.fn(),
  captureException: vi.fn(),
  withScope: vi.fn(
    (fn: (scope: { setTag: typeof vi.fn; setUser: typeof vi.fn }) => void) => {
      fn({ setTag: sentryMocks.setTag, setUser: sentryMocks.setUser })
    }
  ),
  init: vi.fn(),
}))

vi.mock("@sentry/node", () => ({
  init: sentryMocks.init,
  withScope: sentryMocks.withScope,
  captureException: sentryMocks.captureException,
}))

const { captureTrpcError, shouldCaptureTrpcError } = await import("./sentry.js")

describe("shouldCaptureTrpcError", () => {
  it("skips expected client errors", () => {
    expect(
      shouldCaptureTrpcError(new TRPCError({ code: "UNAUTHORIZED" }))
    ).toBe(false)
    expect(shouldCaptureTrpcError(new TRPCError({ code: "BAD_REQUEST" }))).toBe(
      false
    )
  })

  it("captures internal failures and unknown throws", () => {
    expect(
      shouldCaptureTrpcError(new TRPCError({ code: "INTERNAL_SERVER_ERROR" }))
    ).toBe(true)
    expect(shouldCaptureTrpcError(new Error("boom"))).toBe(true)
  })
})

describe("captureTrpcError", () => {
  afterEach(() => {
    vi.clearAllMocks()
    delete process.env.SENTRY_DSN
  })

  it("tags Sentry with the request id", () => {
    process.env.SENTRY_DSN = "https://example@sentry.io/1"

    captureTrpcError(new Error("probe"), {
      requestId: "req-abc",
      path: "health",
      userId: "user-1",
    })

    expect(sentryMocks.setTag).toHaveBeenCalledWith("request_id", "req-abc")
    expect(sentryMocks.setTag).toHaveBeenCalledWith("trpc.path", "health")
    expect(sentryMocks.setUser).toHaveBeenCalledWith({ id: "user-1" })
    expect(sentryMocks.captureException).toHaveBeenCalled()
  })

  it("does nothing when Sentry is not configured", () => {
    captureTrpcError(new Error("probe"), { requestId: "req-abc" })
    expect(sentryMocks.withScope).not.toHaveBeenCalled()
  })

  it("reports the underlying cause of an internal tRPC error", () => {
    process.env.SENTRY_DSN = "https://example@sentry.io/1"
    const cause = new Error("relation talent_profiles does not exist")
    captureTrpcError(
      new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Request failed",
        cause,
      }),
      {
        requestId: "req-cause",
      }
    )
    expect(sentryMocks.captureException).toHaveBeenCalledWith(cause)
  })
})
