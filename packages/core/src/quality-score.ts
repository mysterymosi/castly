/**
 * Portfolio quality for ranking. Follower count and sensitive attributes are not inputs
 * (TECH_SPEC §7.5). Callers must not pass them.
 */
export type VerificationTier = "none" | "professional" | "identity"

export type QualityScoreInput = {
  /** 0..100 completeness already computed without sensitive fields. */
  completenessScore: number
  readyMediaCount: number
  /** Mean shorter edge in px across ready images. 0 when there are none. */
  meanImageShortEdge: number
  hasShowreel: boolean
  creditCount: number
  verificationTier: VerificationTier
}

const WEIGHT = {
  completeness: 40,
  media: 15,
  resolution: 15,
  showreel: 15,
  credits: 10,
  verification: 5,
} as const

const mediaCap = 6
const creditCap = 5
const resolutionTargetPx = 1080

function clampUnit(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.min(1, value)
}

function verificationPoints(tier: VerificationTier) {
  if (tier === "identity") return WEIGHT.verification
  if (tier === "professional") return 3
  return 0
}

/** 0..100, two decimal places, matching `quality_score` numeric(5,2). */
export function computeQualityScore(input: QualityScoreInput) {
  const completeness =
    clampUnit(input.completenessScore / 100) * WEIGHT.completeness
  const media = clampUnit(input.readyMediaCount / mediaCap) * WEIGHT.media
  const resolution =
    clampUnit(input.meanImageShortEdge / resolutionTargetPx) * WEIGHT.resolution
  const showreel = input.hasShowreel ? WEIGHT.showreel : 0
  const credits = clampUnit(input.creditCount / creditCap) * WEIGHT.credits
  const verification = verificationPoints(input.verificationTier)
  const score = completeness + media + resolution + showreel + credits + verification
  return Math.round(Math.min(100, score) * 100) / 100
}
