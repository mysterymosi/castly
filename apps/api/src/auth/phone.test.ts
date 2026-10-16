import { describe, expect, it } from "vitest"

import { InvalidPhone, toNigerianE164 } from "./phone.js"

describe("toNigerianE164", () => {
  it("accepts local, international, and already-E.164 forms", () => {
    expect(toNigerianE164("08031234567")).toBe("+2348031234567")
    expect(toNigerianE164("2348031234567")).toBe("+2348031234567")
    expect(toNigerianE164("+234 803 123 4567")).toBe("+2348031234567")
  })

  it("rejects numbers that are not Nigerian mobiles", () => {
    expect(() => toNigerianE164("+14155552671")).toThrow(InvalidPhone)
    expect(() => toNigerianE164("12345")).toThrow(InvalidPhone)
  })
})
