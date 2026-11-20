export type MatchErrorCode = "match_not_found" | "role_not_found" | "role_required" | "role_has_no_brief"

export class MatchError extends Error {
  readonly code: MatchErrorCode

  constructor(message: string, code: MatchErrorCode) {
    super(message)
    this.name = "MatchError"
    this.code = code
  }
}
