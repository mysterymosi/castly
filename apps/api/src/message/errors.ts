export type MessageErrorCode = "conversation_not_found" | "media_not_usable"

export class MessageError extends Error {
  readonly code: MessageErrorCode

  constructor(message: string, code: MessageErrorCode) {
    super(message)
    this.name = "MessageError"
    this.code = code
  }
}
