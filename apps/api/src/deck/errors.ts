export type DeckErrorCode =
  | "unknown_attribute"
  | "sensitive_requires_brief"
  | "attribute_filter_unavailable"
  | "session_not_found"
  | "session_ended"
  | "card_not_served"
  | "already_decided"
  | "undo_limit"
  | "nothing_to_undo"

export class DeckError extends Error {
  readonly code: DeckErrorCode

  constructor(message: string, code: DeckErrorCode) {
    super(message)
    this.name = "DeckError"
    this.code = code
  }
}
