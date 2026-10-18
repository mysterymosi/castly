import { z } from "zod"

import {
  aboutConfigV1,
  attributesConfigV1,
  availabilityConfigV1,
  creditsConfigV1,
  galleryConfigV1,
  languagesConfigV1,
  ratesConfigV1,
  showreelConfigV1,
  skillsConfigV1,
} from "./definitions/core"
import {
  heroConfigV1,
  heroConfigV2,
  heroCurrentVersion,
  heroMigrators,
  heroSchemas,
  heroType,
} from "./definitions/hero"
import {
  affiliationsConfigV1,
  audioConfigV1,
  customConfigV1,
  pressConfigV1,
  socialConfigV1,
  testimonialsConfigV1,
  trainingConfigV1,
} from "./definitions/stubs"
import { PortfolioSectionValidationError } from "./errors"
import { portfolioSectionTypes, type PortfolioSectionType } from "./types"

type Migrator = (body: unknown) => unknown

export type SectionTypeDefinition = {
  type: PortfolioSectionType
  currentVersion: number
  schemas: Record<number, z.ZodType>
  migrators: Record<number, Migrator>
}

function singleVersion(
  type: PortfolioSectionType,
  schema: z.ZodType,
): SectionTypeDefinition {
  return {
    type,
    currentVersion: 1,
    schemas: { 1: schema },
    migrators: {},
  }
}

export const sectionRegistry: Record<PortfolioSectionType, SectionTypeDefinition> = {
  hero: {
    type: heroType,
    currentVersion: heroCurrentVersion,
    schemas: heroSchemas,
    migrators: heroMigrators,
  },
  about: singleVersion("about", aboutConfigV1),
  gallery: singleVersion("gallery", galleryConfigV1),
  showreel: singleVersion("showreel", showreelConfigV1),
  credits: singleVersion("credits", creditsConfigV1),
  attributes: singleVersion("attributes", attributesConfigV1),
  skills: singleVersion("skills", skillsConfigV1),
  languages: singleVersion("languages", languagesConfigV1),
  rates: singleVersion("rates", ratesConfigV1),
  availability: singleVersion("availability", availabilityConfigV1),
  audio: singleVersion("audio", audioConfigV1),
  training: singleVersion("training", trainingConfigV1),
  affiliations: singleVersion("affiliations", affiliationsConfigV1),
  press: singleVersion("press", pressConfigV1),
  testimonials: singleVersion("testimonials", testimonialsConfigV1),
  social: singleVersion("social", socialConfigV1),
  custom: singleVersion("custom", customConfigV1),
}

export function currentSchemaVersion(type: PortfolioSectionType): number {
  return sectionRegistry[type].currentVersion
}

function schemaAtVersion(def: SectionTypeDefinition, version: number): z.ZodType {
  const schema = def.schemas[version]
  if (!schema) {
    throw new PortfolioSectionValidationError(
      `No schema registered for ${def.type} at version ${version}`,
    )
  }
  return schema
}

export function assertPortfolioSectionType(type: string): PortfolioSectionType {
  if (!(type in sectionRegistry)) {
    throw new PortfolioSectionValidationError(`Unknown portfolio section type: ${type}`)
  }
  return type as PortfolioSectionType
}

export function migrateSectionBody(
  type: PortfolioSectionType,
  schemaVersion: number,
  body: unknown,
): { schemaVersion: number; config: unknown } {
  const def = sectionRegistry[type]
  if (schemaVersion < 1 || schemaVersion > def.currentVersion) {
    throw new PortfolioSectionValidationError(
      `Unsupported schema_version ${schemaVersion} for section type ${type}`,
    )
  }

  let version = schemaVersion
  let config = body

  while (version < def.currentVersion) {
    const step = def.migrators[version]
    if (!step) {
      throw new PortfolioSectionValidationError(
        `Missing forward migrator for ${type} at version ${version}`,
      )
    }
    config = step(config)
    version += 1
  }

  const parsed = schemaAtVersion(def, def.currentVersion).safeParse(config)
  if (!parsed.success) {
    throw new PortfolioSectionValidationError(
      `Migrated config for ${type} is invalid at version ${def.currentVersion}`,
      parsed.error.flatten(),
    )
  }

  return { schemaVersion: def.currentVersion, config: parsed.data }
}

export function validateSectionConfigWrite(
  type: PortfolioSectionType,
  schemaVersion: number,
  config: unknown,
): unknown {
  const def = sectionRegistry[type]
  if (schemaVersion !== def.currentVersion) {
    throw new PortfolioSectionValidationError(
      `Writes must use schema_version ${def.currentVersion} for ${type}, got ${schemaVersion}`,
    )
  }

  const parsed = schemaAtVersion(def, def.currentVersion).safeParse(config)
  if (!parsed.success) {
    throw new PortfolioSectionValidationError(
      `Invalid config for ${type} at schema_version ${schemaVersion}`,
      parsed.error.flatten(),
    )
  }

  return parsed.data
}

export function readSectionConfig(
  type: PortfolioSectionType,
  schemaVersion: number,
  config: unknown,
): unknown {
  return migrateSectionBody(type, schemaVersion, config).config
}

const currentSectionSchemas = portfolioSectionTypes.map((type) => {
  const def = sectionRegistry[type]
  const bodySchema = schemaAtVersion(def, def.currentVersion)
  return z.object({
    type: z.literal(type),
    schemaVersion: z.literal(def.currentVersion),
    config: bodySchema,
  })
})

/** Discriminated union of current-version sections (API / client payloads). */
export const portfolioSectionSchema = z.discriminatedUnion(
  "type",
  currentSectionSchemas as [
    (typeof currentSectionSchemas)[0],
    ...(typeof currentSectionSchemas)[number][],
  ],
)

export type PortfolioSection = z.infer<typeof portfolioSectionSchema>

/** Stored row shape: `type` and `schema_version` columns plus JSON body. */
export type StoredPortfolioSectionRow = {
  type: PortfolioSectionType
  schemaVersion: number
  config: unknown
}

export function readStoredPortfolioSection(row: StoredPortfolioSectionRow): PortfolioSection {
  const type = assertPortfolioSectionType(row.type)
  const config = readSectionConfig(type, row.schemaVersion, row.config)
  const currentVersion = currentSchemaVersion(type)
  return portfolioSectionSchema.parse({
    type,
    schemaVersion: currentVersion,
    config,
  })
}

export function validatePortfolioSectionWrite(
  type: PortfolioSectionType,
  schemaVersion: number,
  config: unknown,
): PortfolioSection {
  const validatedConfig = validateSectionConfigWrite(type, schemaVersion, config)
  return portfolioSectionSchema.parse({
    type,
    schemaVersion: currentSchemaVersion(type),
    config: validatedConfig,
  })
}
