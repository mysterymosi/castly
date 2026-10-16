import { describe, expect, it } from "vitest"

import { assertAdult, InvalidDateOfBirth, UnderageError } from "./age.js"

const now = new Date("2026-10-08T12:00:00.000Z")

describe("assertAdult", () => {
  it("accepts someone who turns 18 today in Lagos", () => {
    expect(() => assertAdult("2008-10-08", now)).not.toThrow()
  })

  it("rejects someone who turns 18 tomorrow", () => {
    expect(() => assertAdult("2008-10-09", now)).toThrow(UnderageError)
  })

  it("rejects an impossible calendar date", () => {
    expect(() => assertAdult("2008-02-31", now)).toThrow(InvalidDateOfBirth)
  })
})
