import { ownerTalentDtoSchema, talentDtoSchema } from "@workspace/schema"
import { describe, expect, it } from "vitest"

import {
  serializeTalent,
  TalentOwnershipMismatch,
  type TalentRateVisibility,
  type TalentRecord,
  type TalentViewer,
} from "./serialize-talent.js"

const ownerId = "01900000-0000-7000-8000-000000000001"
const otherId = "01900000-0000-7000-8000-000000000002"

function talent(rateVisibility: TalentRateVisibility): TalentRecord {
  return {
    profile: {
      userId: ownerId,
      slug: "tunde",
      displayName: "Tunde Adeyemi",
      headline: null,
      bio: "Actor based in Lagos.",
      cityId: null,
      cityName: "Lagos",
      cardConfig: { leadMediaId: null, highlightFacts: [] },
      status: "live",
      publishedAt: new Date("2026-10-01T00:00:00Z"),
      quickStartCompletedAt: new Date("2026-09-30T00:00:00Z"),
      completenessScore: 80,
      qualityScore: 72.5,
      rateVisibility,
    },
    sections: [
      {
        id: "01900000-0000-7000-8000-0000000000a1",
        type: "about",
        schemaVersion: 1,
        position: 0,
        isVisible: true,
        config: {},
      },
      {
        id: "01900000-0000-7000-8000-0000000000a2",
        type: "rates",
        schemaVersion: 1,
        position: 1,
        isVisible: true,
        config: { showCurrency: true },
      },
      {
        id: "01900000-0000-7000-8000-0000000000a3",
        type: "showreel",
        schemaVersion: 1,
        position: 2,
        isVisible: false,
        config: {},
      },
    ],
    skillIds: [],
    rates: [
      { kind: "day", amountMin: 50000, amountMax: 80000, currency: "NGN", negotiable: true },
    ],
    content: {
      credits: [
        {
          title: "The Lagoon",
          roleName: "Lead",
          productionCompany: null,
          year: 2025,
          type: "Film",
          link: null,
          isSignature: true,
          verified: false,
        },
      ],
      attributes: [
        { label: "Height", value: "172 cm", isVisible: true, tier: "standard" },
        { label: "Playing age", value: "25–32", isVisible: false, tier: "standard" },
        { label: "Ethnicity", value: "Yoruba", isVisible: true, tier: "sensitive" },
      ],
      skills: [{ name: "Stage combat" }],
      languages: [{ name: "Yoruba", fluency: "native" }],
      accents: [{ name: "Lagos" }],
      availability: [{ month: "2026-11", status: "available" }],
    },
  }
}

const owner: TalentViewer = { kind: "owner", userId: ownerId }
const booker: TalentViewer = { kind: "user", userId: otherId, verifiedBooker: false }
const verifiedBooker: TalentViewer = { kind: "user", userId: otherId, verifiedBooker: true }
const anonymous: TalentViewer = { kind: "anonymous" }

describe("serializeTalent", () => {
  it("gives the owner every field, hidden rates and hidden sections included", () => {
    const dto = serializeTalent(talent("hidden"), { kind: "owner", userId: ownerId }, {})
    expect(dto.rates).toHaveLength(1)
    expect(dto.sections.map((s) => s.type)).toEqual(["about", "rates", "showreel"])
    expect(dto.profile.qualityScore).toBe(72.5)
    expect(ownerTalentDtoSchema.safeParse(dto).success).toBe(true)
  })

  it("omits hidden rates and the rates section for every non-owner — absent, not null", () => {
    for (const viewer of [booker, verifiedBooker, anonymous]) {
      const dto = serializeTalent(talent("hidden"), viewer, {})
      expect(Object.hasOwn(dto, "rates")).toBe(false)
      expect(dto.sections.some((s) => s.type === "rates")).toBe(false)
      expect(JSON.stringify(dto)).not.toContain("50000")
      expect(talentDtoSchema.safeParse(dto).success).toBe(true)
    }
  })

  it("shows public rates to anyone and verified-booker rates only to verified bookers", () => {
    expect(serializeTalent(talent("public"), anonymous, {}).rates).toHaveLength(1)
    expect(Object.hasOwn(serializeTalent(talent("verified_bookers"), booker, {}), "rates")).toBe(
      false,
    )
    expect(serializeTalent(talent("verified_bookers"), verifiedBooker, {}).rates).toHaveLength(1)
  })

  it("leaves owner-only fields and hidden sections out for non-owners", () => {
    const dto = serializeTalent(talent("public"), booker, {})
    for (const key of ["status", "quickStartCompletedAt", "completenessScore", "qualityScore"]) {
      expect(Object.hasOwn(dto.profile, key)).toBe(false)
    }
    expect(dto.sections.map((s) => s.type)).toEqual(["about", "rates"])
  })

  it("treats a signed-in viewer who owns the talent as the owner", () => {
    const dto = serializeTalent(
      talent("hidden"),
      { kind: "user", userId: ownerId, verifiedBooker: false },
      {},
    )
    expect(dto.rates).toHaveLength(1)
    expect(dto.profile.qualityScore).toBe(72.5)
  })

  it("refuses an owner viewer that does not own the talent", () => {
    expect(() => serializeTalent(talent("public"), { kind: "owner", userId: otherId }, {})).toThrow(
      TalentOwnershipMismatch,
    )
  })

  it("sends only visible, standard-tier attributes — to every viewer, the owner included", () => {
    for (const viewer of [owner, booker, verifiedBooker, anonymous]) {
      const dto = serializeTalent(talent("public"), viewer, {})
      expect(dto.content.attributes).toEqual([{ label: "Height", value: "172 cm" }])
      expect(JSON.stringify(dto)).not.toContain("Ethnicity")
      expect(JSON.stringify(dto)).not.toContain("Playing age")
    }
  })

  it("passes the public list rows through unchanged", () => {
    const dto = serializeTalent(talent("public"), anonymous, {})
    expect(dto.content.credits.map((c) => c.title)).toEqual(["The Lagoon"])
    expect(dto.content.languages).toEqual([{ name: "Yoruba", fluency: "native" }])
    expect(dto.content.accents).toEqual([{ name: "Lagos" }])
    expect(dto.content.availability).toEqual([{ month: "2026-11", status: "available" }])
    expect(talentDtoSchema.safeParse(dto).success).toBe(true)
  })
})
