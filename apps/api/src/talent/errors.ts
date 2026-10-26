export type StudioErrorCode =
  | "section_not_found"
  | "invalid_section_order"
  | "unknown_attribute"
  | "profile_create_failed"
  | "publish_not_ready"
  | "profile_suspended"
  | "talent_not_found"

export class StudioError extends Error {
  readonly code: StudioErrorCode

  constructor(message: string, code: StudioErrorCode) {
    super(message)
    this.name = "StudioError"
    this.code = code
  }
}
