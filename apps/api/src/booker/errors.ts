export type BookerErrorCode = "unknown_city" | "profile_required"

export class BookerError extends Error {
  readonly code: BookerErrorCode

  constructor(message: string, code: BookerErrorCode) {
    super(message)
    this.name = "BookerError"
    this.code = code
  }
}
