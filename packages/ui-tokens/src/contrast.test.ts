import { describe, expect, it } from "vitest"

import { colors, contrastPairs, contrastRatio, type ColorScheme } from "./index.js"

const schemes: ColorScheme[] = ["light", "dark"]

describe("WCAG AA contrast", () => {
  for (const scheme of schemes) {
    for (const pair of contrastPairs) {
      const min = pair.large ? 3 : 4.5
      it(`${scheme}: ${pair.fg} on ${pair.bg} >= ${min}:1`, () => {
        const ratio = contrastRatio(colors[scheme][pair.fg], colors[scheme][pair.bg])
        expect(ratio).toBeGreaterThanOrEqual(min)
      })
    }
  }
})
