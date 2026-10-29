// This guard reads core's source files, so unlike the rest of this (I/O-free) package it needs Node.
/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { bookerVerticals } from "@workspace/schema"
import { describe, expect, it } from "vitest"

import { verticalCategoryMatch } from "./vertical-category-match.js"

const actors = "01900000-0000-7000-8000-00000000c001"
const models = "01900000-0000-7000-8000-00000000c002"
const crew = "01900000-0000-7000-8000-00000000c003"

describe("verticalCategoryMatch", () => {
  const weights = { [actors]: 1, [models]: 0.7 }

  it("takes the strongest weight among the talent's categories", () => {
    expect(verticalCategoryMatch([models, actors], weights)).toBe(1)
    expect(verticalCategoryMatch([models], weights)).toBe(0.7)
  })

  it("scores 0 when no category has a weight", () => {
    expect(verticalCategoryMatch([crew], weights)).toBe(0)
    expect(verticalCategoryMatch([], weights)).toBe(0)
    expect(verticalCategoryMatch([actors], {})).toBe(0)
  })

  it("follows the data: changing a weight changes the match", () => {
    expect(verticalCategoryMatch([models], { ...weights, [models]: 0.2 })).toBe(0.2)
  })
})

describe("no hardcoded vertical mapping in packages/core", () => {
  it("never names a booker vertical in core source", () => {
    const dir = import.meta.dirname
    const sources = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    const hits = sources.flatMap((file) => {
      const text = readFileSync(join(dir, file), "utf8")
      return bookerVerticals
        .filter((vertical) => new RegExp(`["'\`]${vertical}["'\`]`).test(text))
        .map((vertical) => `${file}: "${vertical}"`)
    })
    expect(hits).toEqual([])
  })
})
