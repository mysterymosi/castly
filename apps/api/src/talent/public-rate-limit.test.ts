import { afterEach, describe, expect, it } from "vitest"

import {
  consumePublicRead,
  createPublicReadLimiter,
  isWebServerKey,
  PUBLIC_READ_IP_MAX,
  PUBLIC_READ_WINDOW_MS,
  publicReadLimiter,
  PublicReadRateLimited,
} from "./public-rate-limit.js"

describe("public read rate limit", () => {
  afterEach(() => {
    delete process.env.CASTLY_WEB_API_KEY
    publicReadLimiter.reset()
  })

  it("rejects the request after the per-IP cap and reopens after the window", () => {
    let now = 1_000_000
    const limiter = createPublicReadLimiter(() => now)
    for (let i = 0; i < PUBLIC_READ_IP_MAX; i += 1) limiter.consume("ip:a", PUBLIC_READ_IP_MAX)
    expect(() => limiter.consume("ip:a", PUBLIC_READ_IP_MAX)).toThrow(PublicReadRateLimited)
    // Another IP is unaffected.
    limiter.consume("ip:b", PUBLIC_READ_IP_MAX)

    now += PUBLIC_READ_WINDOW_MS
    expect(() => limiter.consume("ip:a", PUBLIC_READ_IP_MAX)).not.toThrow()
  })

  it("reports how long until the window resets", () => {
    let now = 1_000_000
    const limiter = createPublicReadLimiter(() => now)
    limiter.consume("ip:a", 1)
    now += 45_000
    try {
      limiter.consume("ip:a", 1)
      expect.fail("expected a rate limit")
    } catch (error) {
      expect((error as PublicReadRateLimited).retryAfterSeconds).toBe(15)
    }
  })

  it("only recognises the web server key when it matches exactly", () => {
    expect(isWebServerKey("anything")).toBe(false)
    process.env.CASTLY_WEB_API_KEY = "web-secret"
    expect(isWebServerKey("web-secret")).toBe(true)
    expect(isWebServerKey("web-secret-x")).toBe(false)
    expect(isWebServerKey(null)).toBe(false)
  })

  it("gives the web server its own bucket instead of its IP's", () => {
    process.env.CASTLY_WEB_API_KEY = "web-secret"
    for (let i = 0; i < PUBLIC_READ_IP_MAX; i += 1) consumePublicRead("10.0.0.5", null)
    expect(() => consumePublicRead("10.0.0.5", null)).toThrow(PublicReadRateLimited)
    expect(() => consumePublicRead("10.0.0.5", "web-secret")).not.toThrow()
  })
})
