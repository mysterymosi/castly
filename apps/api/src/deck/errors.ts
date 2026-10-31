export type DeckErrorCode =
  | "unknown_attribute"
  | "sensitive_requires_brief"
  | "attribute_filter_unavailable"
  | "session_not_found"
  | "session_ended"

export class DeckError extends Error {
  readonly code: DeckErrorCode

  constructor(message: string, code: DeckErrorCode) {
    super(message)
    this.name = "DeckError"
    this.code = code
  }
}
