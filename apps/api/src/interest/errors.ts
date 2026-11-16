export type InterestErrorCode =
  | "interest_not_found"
  | "interest_closed"
  | "interest_expired"
  | "talent_profile_required"

export class InterestError extends Error {
  readonly code: InterestErrorCode

  constructor(message: string, code: InterestErrorCode) {
    super(message)
    this.name = "InterestError"
    this.code = code
  }
}
