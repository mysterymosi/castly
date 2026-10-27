import type {
  CardConfig,
  OwnerTalentDto,
  TalentContentDto,
  TalentDto,
  TalentRateDto,
  TalentSectionDto,
} from "@workspace/schema"

/**
 * The single place a talent becomes an API payload (TECH_SPEC §6.1).
 * Disallowed fields are left out of the object — absent, not null — so a client bug cannot
 * surface a hidden value. M8 adds sensitive-attribute rules on `viewer` tier and `context`.
 */
export type TalentRateVisibility = "public" | "verified_bookers" | "hidden"

/** An attribute value with what decides who may see it. `prohibited` rows cannot exist (DB check). */
export type TalentAttributeRow = {
  label: string
  value: string
  isVisible: boolean
  tier: "standard" | "sensitive"
}

/** Already loaded and migrated by the caller; section configs must be at their current version. */
export type TalentRecord = {
  profile: {
    userId: string
    slug: string
    displayName: string
    headline: string | null
    bio: string | null
    cityId: string | null
    cityName: string | null
    cardConfig: CardConfig
    status: "draft" | "live" | "suspended"
    publishedAt: Date | null
    quickStartCompletedAt: Date | null
    completenessScore: number
    qualityScore: number
    rateVisibility: TalentRateVisibility
  }
  sections: TalentSectionDto[]
  skillIds: string[]
  rates: TalentRateDto[]
  /** List-section rows; attributes are filtered here, the rest are public. */
  content: Omit<TalentContentDto, "attributes"> & { attributes: TalentAttributeRow[] }
}

export type OwnerViewer = { kind: "owner"; userId: string }

export type TalentViewer =
  | OwnerViewer
  | {
      kind: "user"
      userId: string
      /** Stub until M7 stores booker verification; pass false when unknown. */
      verifiedBooker: boolean
    }
  | { kind: "anonymous" }

export type SerializeTalentContext = {
  /** M8: the booker's active role, which gates sensitive attributes. Unused in M2. */
  activeRoleId?: string | null
}

export class TalentOwnershipMismatch extends Error {
  constructor() {
    super("serializeTalent: an owner viewer must own the talent")
  }
}

function isOwner(talent: TalentRecord, viewer: TalentViewer) {
  if (viewer.kind === "anonymous") return false
  return viewer.userId === talent.profile.userId
}

/**
 * Attributes on a portfolio: visible, standard tier only — for every viewer, the owner included,
 * so the studio preview shows what others see. Sensitive attributes never reach a portfolio;
 * M8 adds role-gated sensitive matching for verified bookers, not display.
 */
function portfolioAttributes(talent: TalentRecord): TalentContentDto["attributes"] {
  return talent.content.attributes
    .filter((attribute) => attribute.isVisible && attribute.tier === "standard")
    .map(({ label, value }) => ({ label, value }))
}

function canSeeRates(talent: TalentRecord, viewer: TalentViewer) {
  if (isOwner(talent, viewer)) return true
  switch (talent.profile.rateVisibility) {
    case "public":
      return true
    case "verified_bookers":
      return viewer.kind === "user" && viewer.verifiedBooker
    case "hidden":
      return false
  }
}

export function serializeTalent(
  talent: TalentRecord,
  viewer: OwnerViewer,
  context: SerializeTalentContext,
): OwnerTalentDto
export function serializeTalent(
  talent: TalentRecord,
  viewer: TalentViewer,
  context: SerializeTalentContext,
): TalentDto
export function serializeTalent(
  talent: TalentRecord,
  viewer: TalentViewer,
  _context: SerializeTalentContext,
): TalentDto | OwnerTalentDto {
  if (viewer.kind === "owner" && !isOwner(talent, viewer)) {
    throw new TalentOwnershipMismatch()
  }

  const { profile } = talent
  const owner = isOwner(talent, viewer)
  const rates = canSeeRates(talent, viewer)

  const dto: Record<string, unknown> = {
    profile: {
      userId: profile.userId,
      slug: profile.slug,
      displayName: profile.displayName,
      headline: profile.headline,
      bio: profile.bio,
      cityId: profile.cityId,
      cityName: profile.cityName,
      cardConfig: profile.cardConfig,
      publishedAt: profile.publishedAt?.toISOString() ?? null,
      rateVisibility: profile.rateVisibility,
      ...(owner
        ? {
            status: profile.status,
            quickStartCompletedAt: profile.quickStartCompletedAt?.toISOString() ?? null,
            completenessScore: profile.completenessScore,
            qualityScore: profile.qualityScore,
          }
        : {}),
    },
    sections: talent.sections.filter(
      (section) => (owner || section.isVisible) && (rates || section.type !== "rates"),
    ),
    skillIds: talent.skillIds,
    content: { ...talent.content, attributes: portfolioAttributes(talent) },
  }
  if (rates) dto.rates = talent.rates

  return dto as TalentDto | OwnerTalentDto
}
