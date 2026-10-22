import { TRPCError } from "@trpc/server"
import { PortfolioSectionValidationError } from "@workspace/schema"

import { InvalidDateOfBirth, UnderageError } from "../auth/age.js"
import { OtpRateLimited } from "../auth/rate-limit.js"
import { AuthRejected } from "../auth/supabase.js"
import { MediaError } from "../media/errors.js"
import { StudioError } from "../talent/errors.js"

const mediaCode = {
  media_not_found: "NOT_FOUND",
  media_forbidden: "FORBIDDEN",
  upload_token_invalid: "BAD_REQUEST",
  upload_token_consumed: "BAD_REQUEST",
  upload_token_expired: "BAD_REQUEST",
  invalid_kind: "BAD_REQUEST",
  delete_not_allowed: "BAD_REQUEST",
} as const

const studioCode = {
  section_not_found: "NOT_FOUND",
  invalid_section_order: "BAD_REQUEST",
  unknown_attribute: "BAD_REQUEST",
  profile_create_failed: "INTERNAL_SERVER_ERROR",
  publish_not_ready: "PRECONDITION_FAILED",
  profile_suspended: "FORBIDDEN",
} as const

/** Map known domain failures to tRPC codes. Unexpected errors stay 500 and keep their cause. */
export function throwTrpc(error: unknown): never {
  if (error instanceof MediaError) {
    throw new TRPCError({
      code: mediaCode[error.code],
      message: error.message,
      cause: error,
    })
  }
  if (error instanceof StudioError) {
    throw new TRPCError({
      code: studioCode[error.code],
      message: error.message,
      cause: error,
    })
  }
  if (error instanceof PortfolioSectionValidationError) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: error.message,
      cause: error,
    })
  }
  if (error instanceof OtpRateLimited) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: error.message,
      cause: error,
    })
  }
  if (error instanceof UnderageError || error instanceof InvalidDateOfBirth) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: error.message,
      cause: error,
    })
  }
  if (error instanceof AuthRejected) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: error.message,
      cause: error,
    })
  }
  if (error instanceof TRPCError) throw error
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Request failed",
    cause: error,
  })
}

export async function callProcedure<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    throwTrpc(error)
  }
}
