import { execSync } from "node:child_process"

import * as Sentry from "@sentry/node"
import { TRPCError } from "@trpc/server"
import { releaseFromEnv } from "@workspace/core"

export function resolveApiRelease(): string {
  const fromEnv = releaseFromEnv("SENTRY_RELEASE")
  if (fromEnv !== "local") return fromEnv
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim()
  } catch {
    return "local"
  }
}

export function initApiSentry(): boolean {
  const dsn = process.env.SENTRY_DSN?.trim()
  if (!dsn) return false

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    release: resolveApiRelease(),
  })
  return true
}

/** Report server bugs, not expected client/auth failures. */
export function shouldCaptureTrpcError(error: unknown): boolean {
  if (error instanceof TRPCError) {
    return (
      error.code === "INTERNAL_SERVER_ERROR" || error.code === "NOT_IMPLEMENTED"
    )
  }
  return true
}

function reportableException(error: unknown): Error {
  if (error instanceof TRPCError && error.cause instanceof Error)
    return error.cause
  if (error instanceof Error) return error
  return new Error(String(error))
}

export function captureTrpcError(
  error: unknown,
  meta: { requestId: string; path?: string; userId?: string }
) {
  if (!process.env.SENTRY_DSN?.trim()) return
  if (!shouldCaptureTrpcError(error)) return

  Sentry.withScope((scope) => {
    scope.setTag("request_id", meta.requestId)
    if (meta.path) scope.setTag("trpc.path", meta.path)
    if (meta.userId) scope.setUser({ id: meta.userId })
    Sentry.captureException(reportableException(error))
  })
}
