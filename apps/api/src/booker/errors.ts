export type BookerErrorCode =
  | "unknown_city"
  | "profile_required"
  | "unknown_category"
  | "shortlist_not_found"
  | "not_on_shortlist"

export class BookerError extends Error {
  readonly code: BookerErrorCode

  constructor(message: string, code: BookerErrorCode) {
    super(message)
    this.name = "BookerError"
    this.code = code
  }
}
