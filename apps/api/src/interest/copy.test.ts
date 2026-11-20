import { bookerVerticals } from "@workspace/schema"
import { describe, expect, it } from "vitest"

import { interestHeadline } from "./copy.js"

describe("interestHeadline", () => {
  it("names the vertical and, when there is one, the project", () => {
    expect(interestHeadline("casting_director", null)).toBe("A casting director is interested in you")
    expect(interestHeadline("casting_director", "Lagos Nights")).toBe(
      "A casting director is interested in you for Lagos Nights",
    )
  })

  it("uses 'an' before a vowel and a plain 'booker' for other", () => {
    expect(interestHeadline("event_planner", null)).toBe("An event planner is interested in you")
    expect(interestHeadline("other", null)).toBe("A booker is interested in you")
  })

  it("reads professionally for every vertical: interested, never liked, no flourish", () => {
    for (const vertical of bookerVerticals) {
      const text = interestHeadline(vertical, "Lagos Nights")
      expect(text).toMatch(/^An? [a-z ]+ is interested in you for Lagos Nights$/)
      expect(text).not.toMatch(/lik|match|!/i)
    }
  })
})
