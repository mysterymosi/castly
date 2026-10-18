import { describe, expect, it } from "vitest"

import { heroConfigV1, heroConfigV2 } from "./definitions/hero"
import { PortfolioSectionValidationError } from "./errors"
import {
  currentSchemaVersion,
  migrateSectionBody,
  readStoredPortfolioSection,
  validatePortfolioSectionWrite,
  validateSectionConfigWrite,
} from "./registry"

const heroV1Fixture = {
  style: "full_bleed" as const,
  mediaId: "01932f8a-7b6e-7000-8000-000000000001",
  headline: "Actor · Lagos",
  showBadges: true,
}

describe("portfolio section schema", () => {
  it("migrates hero schemaVersion 1 to current in memory", () => {
    const migrated = migrateSectionBody("hero", 1, heroV1Fixture)
    expect(migrated.schemaVersion).toBe(currentSchemaVersion("hero"))
    expect(migrated.config).toEqual(heroConfigV2.parse({ ...heroV1Fixture, subtitle: undefined }))
  })

  it("reads a stored v1 hero row as current", () => {
    const section = readStoredPortfolioSection({
      type: "hero",
      schemaVersion: 1,
      config: heroV1Fixture,
    })
    expect(section.type).toBe("hero")
    expect(section.schemaVersion).toBe(2)
    expect(section.config).toEqual(heroConfigV2.parse({ ...heroV1Fixture, subtitle: undefined }))
  })

  it("round-trips a write through validate and read", () => {
    const writeConfig = {
      style: "minimal" as const,
      mediaId: null,
      showBadges: false,
      subtitle: "Available for travel",
    }
    const written = validatePortfolioSectionWrite("hero", 2, writeConfig)
    const readBack = readStoredPortfolioSection({
      type: "hero",
      schemaVersion: written.schemaVersion,
      config: written.config,
    })
    expect(readBack).toEqual(written)
  })

  it("rejects writes at a stale schema_version", () => {
    expect(() => validateSectionConfigWrite("hero", 1, heroV1Fixture)).toThrow(
      PortfolioSectionValidationError,
    )
  })

  it("rejects invalid config on write", () => {
    expect(() =>
      validateSectionConfigWrite("hero", 2, {
        ...heroV1Fixture,
        style: "not_a_style",
      }),
    ).toThrow(PortfolioSectionValidationError)
  })

  it("validates v1-only section types without migrators", () => {
    const about = validatePortfolioSectionWrite("about", 1, { body: "One line bio" })
    expect(about.type).toBe("about")
    expect(about.schemaVersion).toBe(1)
  })

  it("accepts stub section types with minimal config", () => {
    const custom = validatePortfolioSectionWrite("custom", 1, { title: "Press kit" })
    expect(custom.config).toEqual({ title: "Press kit" })
  })

  it("parses hero v1 fixture with zod directly for contract baseline", () => {
    expect(heroConfigV1.parse(heroV1Fixture)).toEqual(heroV1Fixture)
  })
})
