export type MediaErrorCode =
  | "media_not_found"
  | "media_forbidden"
  | "upload_token_invalid"
  | "upload_token_consumed"
  | "upload_token_expired"
  | "invalid_kind"
  | "delete_not_allowed"

export class MediaError extends Error {
  readonly code: MediaErrorCode

  constructor(code: MediaErrorCode, message: string) {
    super(message)
    this.name = "MediaError"
    this.code = code
  }
}
