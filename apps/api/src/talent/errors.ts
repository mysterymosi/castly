export type StudioErrorCode =
  | "section_not_found"
  | "invalid_section_order"
  | "unknown_attribute"
  | "profile_create_failed"
  | "publish_not_ready"
  | "profile_suspended"
  | "talent_not_found"
  | "invalid_canvas"
  | "unknown_category"
  | "unknown_city"
  | "unknown_skill"
  | "unknown_language"
  | "unknown_accent"
  | "invalid_attribute_value"
  | "credit_not_found"
  | "invalid_credit_order"
  | "invalid_availability"
  | "invalid_photo"
  | "photo_slots_full"

export class StudioError extends Error {
  readonly code: StudioErrorCode

  constructor(message: string, code: StudioErrorCode) {
    super(message)
    this.name = "StudioError"
    this.code = code
  }
}
