import { describe, expect, it } from "vitest"

import { createOtpLimiter, OtpRateLimited } from "./rate-limit.js"

describe("otp rate limit", () => {
  it("rejects a second request for the same address inside a minute", () => {
    let now = 1_000_000
    const limiter = createOtpLimiter(() => now)
    limiter.consume("+2348031234567", "203.0.113.10")
    expect(() => limiter.consume("+2348031234567", "203.0.113.11")).toThrow(OtpRateLimited)
  })

  it("rejects the 11th request from one IP inside ten minutes", () => {
    const limiter = createOtpLimiter(() => 1_000_000)
    for (let i = 0; i < 10; i += 1) {
      limiter.consume(`+23480312345${String(i).padStart(2, "0")}`, "203.0.113.20")
    }
    expect(() => limiter.consume("+2348091111111", "203.0.113.20")).toThrow(OtpRateLimited)
  })
})
