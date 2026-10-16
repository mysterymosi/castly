import { afterEach, describe, expect, it } from "vitest"

import { releaseFromEnv } from "./release.js"

describe("releaseFromEnv", () => {
  afterEach(() => {
    delete process.env.SENTRY_RELEASE
  })

  it("reads the first configured env key", () => {
    process.env.SENTRY_RELEASE = "abc1234"
    expect(releaseFromEnv("SENTRY_RELEASE")).toBe("abc1234")
  })

  it("falls back to local when unset", () => {
    expect(releaseFromEnv("SENTRY_RELEASE")).toBe("local")
  })
})
