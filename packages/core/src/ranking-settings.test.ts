import { describe, expect, it } from "vitest"

import { DEFAULT_RANKING_WEIGHTS, RANKING_WEIGHT_KEYS, rankingWeightsFromRows } from "./deck.js"
import { DEFAULT_FAIRNESS_CONFIG, FAIRNESS_CONFIG_KEYS, fairnessConfigFromRows } from "./fairness.js"
import { RANKING_SETTINGS, rankingSettingProblem } from "./ranking-settings.js"

describe("RANKING_SETTINGS", () => {
  it("lists every scoring weight and fairness setting once, with its default", () => {
    const keys = RANKING_SETTINGS.map((s) => s.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys.sort()).toEqual([...Object.values(RANKING_WEIGHT_KEYS), ...Object.values(FAIRNESS_CONFIG_KEYS)].sort())
    const defaults = Object.fromEntries(RANKING_SETTINGS.map((s) => [s.key, s.defaultValue]))
    expect(defaults.w_geo).toBe(DEFAULT_RANKING_WEIGHTS.geo)
    expect(defaults.diversity_window).toBe(DEFAULT_FAIRNESS_CONFIG.diversityWindow)
  })

  it("only accepts values the deck's readers will use", () => {
    for (const setting of RANKING_SETTINGS) {
      for (const value of [0, 0.5, 1, 2, 7, -1, 1.5, Number.NaN]) {
        if (rankingSettingProblem(setting.key, value) !== null) continue
        const rows = [{ key: setting.key, value }]
        const read = { ...rankingWeightsFromRows(rows), ...fairnessConfigFromRows(rows) }
        const name = [...Object.entries(RANKING_WEIGHT_KEYS), ...Object.entries(FAIRNESS_CONFIG_KEYS)].find(
          ([, key]) => key === setting.key,
        )![0]
        expect(read[name as keyof typeof read], `${setting.key}=${value}`).toBe(value)
      }
    }
  })

  it("explains what's wrong with a value", () => {
    expect(rankingSettingProblem("w_geo", -0.1)).toMatch(/0 or more/)
    expect(rankingSettingProblem("exploration_fraction", 1.2)).toMatch(/between 0 and 1/)
    expect(rankingSettingProblem("diversity_max_run", 2.5)).toMatch(/whole number/)
    expect(rankingSettingProblem("w_unknown", 1)).toMatch(/Unknown setting/)
    expect(rankingSettingProblem("w_geo", 0.75)).toBeNull()
  })
})
