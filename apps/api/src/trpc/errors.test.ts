import { TRPCError } from "@trpc/server"
import { PortfolioSectionValidationError } from "@workspace/schema"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { InvalidDateOfBirth, UnderageError } from "../auth/age.js"
import { OtpRateLimited } from "../auth/rate-limit.js"
import { AuthRejected } from "../auth/supabase.js"
import { StudioError } from "../talent/errors.js"
import { zodErrorShape } from "./error-shape.js"
import { throwTrpc } from "./errors.js"

function caught(error: unknown) {
  try {
    throwTrpc(error)
  } catch (thrown) {
    return thrown
  }
}

describe("throwTrpc", () => {
  it("maps a missing section to NOT_FOUND and keeps the cause", () => {
    const error = new StudioError("Section not found", "section_not_found")
    expect(caught(error)).toMatchObject({
      code: "NOT_FOUND",
      message: "Section not found",
      cause: error,
    } satisfies Partial<TRPCError>)
  })

  it("maps invalid client input to BAD_REQUEST", () => {
    expect(
      caught(new StudioError("Unknown attribute", "unknown_attribute"))
    ).toMatchObject({
      code: "BAD_REQUEST",
    })
    expect(
      caught(
        new StudioError(
          "Invalid section id in reorder list",
          "invalid_section_order"
        )
      )
    ).toMatchObject({
      code: "BAD_REQUEST",
    })
    expect(
      caught(new PortfolioSectionValidationError("Hero media is required"))
    ).toMatchObject({
      code: "BAD_REQUEST",
      message: "Hero media is required",
    })
    expect(caught(new UnderageError())).toMatchObject({ code: "BAD_REQUEST" })
    expect(caught(new InvalidDateOfBirth())).toMatchObject({
      code: "BAD_REQUEST",
    })
  })

  it("maps auth and rate limits without turning them into server errors", () => {
    expect(caught(new AuthRejected())).toMatchObject({
      code: "UNAUTHORIZED",
      message: "That sign-in attempt was not accepted.",
    })
    expect(caught(new OtpRateLimited(30))).toMatchObject({
      code: "TOO_MANY_REQUESTS",
    })
  })

  it("hides unexpected failures and keeps the original error as the cause", () => {
    const error = new Error("relation talent_profiles does not exist")
    const thrown = caught(error) as TRPCError
    expect(thrown.code).toBe("INTERNAL_SERVER_ERROR")
    expect(thrown.message).toBe("Request failed")
    expect(thrown.cause).toBe(error)
  })

  it("passes a TRPCError through unchanged", () => {
    const error = new TRPCError({ code: "FORBIDDEN", message: "nope" })
    expect(caught(error)).toBe(error)
  })
})

describe("zodErrorShape", () => {
  it("flattens a ZodError into field messages", () => {
    const result = z
      .object({ email: z.email() })
      .safeParse({ email: "not-an-email" })
    expect(result.success).toBe(false)
    if (result.success) return
    const shape = zodErrorShape(result.error)
    expect(shape?.fieldErrors.email?.length).toBeGreaterThan(0)
    expect(shape?.formErrors).toEqual([])
  })

  it("returns null for a non-schema error", () => {
    expect(zodErrorShape(new Error("db down"))).toBeNull()
  })
})
