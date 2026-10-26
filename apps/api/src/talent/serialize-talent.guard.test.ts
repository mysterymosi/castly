import { serializeTalent, type TalentRecord } from "@workspace/core"
import {
  ownerTalentDtoSchema,
  talentDtoSchema,
  type OwnerTalentDto,
  type TalentDto,
} from "@workspace/schema"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { appRouter } from "../trpc/router.js"

/**
 * TECH_SPEC §6.1: no procedure returns a talent payload except via `serializeTalent`.
 * Compile time: the DTO schemas are branded on their input type, so only `serializeTalent`
 * output satisfies them (the `@ts-expect-error` lines below fail typecheck if that ever stops).
 * Run time: every procedure output schema is walked, and talent profile fields may only
 * appear inside the branded DTO schemas.
 */

const handBuiltProfile = {
  userId: "01900000-0000-7000-8000-000000000001",
  slug: "tunde",
  displayName: "Tunde",
  headline: null,
  bio: null,
  cityId: null,
  cityName: null,
  cardConfig: { leadMediaId: null, highlightFacts: [] },
  publishedAt: null,
  rateVisibility: "hidden" as const,
  status: "live" as const,
  quickStartCompletedAt: null,
  completenessScore: 0,
  qualityScore: 0,
}

const emptyContent = {
  credits: [],
  attributes: [],
  skills: [],
  languages: [],
  accents: [],
  availability: [],
}

// @ts-expect-error a hand-built owner payload lacks the SerializedTalent brand
const handBuiltOwner: OwnerTalentDto = {
  profile: handBuiltProfile,
  sections: [],
  skillIds: [],
  content: emptyContent,
  rates: [],
}

// @ts-expect-error a hand-built public payload lacks the SerializedTalent brand
const handBuiltPublic: TalentDto = {
  profile: handBuiltProfile,
  sections: [],
  skillIds: [],
  content: emptyContent,
}

/** Field names that only a talent payload carries. */
const talentFieldNames = ["displayName", "rateVisibility", "qualityScore"]

type ZodNode = { _zod: { def: Record<string, unknown> & { type: string } } }

function isZodNode(value: unknown): value is ZodNode {
  return typeof value === "object" && value !== null && "_zod" in value
}

/** Paths in `schema` where talent fields appear outside a branded DTO schema. */
function unbrandedTalentFields(schema: unknown, path: string, seen = new Set<unknown>()): string[] {
  if (schema === talentDtoSchema || schema === ownerTalentDtoSchema) return []
  if (!isZodNode(schema) || seen.has(schema)) return []
  seen.add(schema)

  const def = schema._zod.def
  const children: [string, unknown][] = []
  if (def.type === "object") {
    const shape = def.shape as Record<string, unknown>
    const leaks = Object.keys(shape)
      .filter((key) => talentFieldNames.includes(key))
      .map((key) => `${path}.${key}`)
    if (leaks.length > 0) return leaks
    children.push(...Object.entries(shape).map(([key, child]) => [`${path}.${key}`, child] as [string, unknown]))
  }
  for (const key of ["element", "innerType", "in", "out", "left", "right", "valueType"]) {
    if (key in def) children.push([path, def[key]])
  }
  if (Array.isArray(def.options)) children.push(...def.options.map((o) => [path, o] as [string, unknown]))

  return children.flatMap(([childPath, child]) => unbrandedTalentFields(child, childPath, seen))
}

describe("serializeTalent is the only way out", () => {
  it("rejects hand-built payloads at runtime too: they still parse, so the brand is the guard", () => {
    // Runtime parsing cannot tell a hand-built object apart; the compile-time brand is what blocks it.
    expect(ownerTalentDtoSchema.safeParse(handBuiltOwner).success).toBe(true)
    expect(talentDtoSchema.safeParse(handBuiltPublic).success).toBe(true)
  })

  it("accepts serializeTalent output without a cast", () => {
    const record: TalentRecord = {
      profile: { ...handBuiltProfile, publishedAt: null, quickStartCompletedAt: null },
      sections: [],
      skillIds: [],
      rates: [],
      content: emptyContent,
    }
    const dto: OwnerTalentDto = serializeTalent(record, { kind: "owner", userId: record.profile.userId }, {})
    expect(ownerTalentDtoSchema.safeParse(dto).success).toBe(true)
  })

  const procedures = (
    appRouter as unknown as { _def: { procedures: Record<string, { _def: { output?: unknown } }> } }
  )._def.procedures

  it("finds talent fields in procedure outputs only inside the branded DTO schemas", () => {
    const leaks = Object.entries(procedures).flatMap(([name, procedure]) =>
      unbrandedTalentFields(procedure._def.output, name),
    )
    expect(leaks).toEqual([])
    // The walker must actually reach the studio payload, or the check above proves nothing.
    expect(procedures["talent.studio.get"]?._def.output).toBeDefined()
  })

  it("requires every talent procedure to declare an output, so the brand applies", () => {
    const missing = Object.entries(procedures)
      .filter(([name, procedure]) => name.startsWith("talent.") && !procedure._def.output)
      .map(([name]) => name)
    expect(missing).toEqual([])
  })

  it("walker flags an unbranded talent shape", () => {
    const leaky = z.object({ talent: z.object({ displayName: z.string() }) })
    expect(unbrandedTalentFields(leaky, "probe")).toEqual(["probe.talent.displayName"])
  })
})
