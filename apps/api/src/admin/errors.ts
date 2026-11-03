export type AdminErrorCode = "booker_not_found" | "invalid_ranking_setting"

export class AdminError extends Error {
  readonly code: AdminErrorCode

  constructor(message: string, code: AdminErrorCode) {
    super(message)
    this.name = "AdminError"
    this.code = code
  }
}
