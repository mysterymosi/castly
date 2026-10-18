import Constants from "expo-constants"
import {
  createTRPCClient,
  httpBatchLink,
  TRPCClientError,
  type TRPCClient,
} from "@trpc/client"
import type { AppRouter } from "api/router"

import { getAccessToken } from "@/auth/token"

export function apiBaseUrl() {
  const configured = process.env.EXPO_PUBLIC_API_URL
  if (configured) return configured.replace(/\/$/, "")
  const host = Constants.expoConfig?.hostUri?.split(":")[0]
  return `http://${host ?? "127.0.0.1"}:3001`
}

function requestId() {
  const crypto = (globalThis as { crypto?: { randomUUID?: () => string } })
    .crypto
  return crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}

export const trpc: TRPCClient<AppRouter> = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${apiBaseUrl()}/trpc`,
      headers() {
        const headers: Record<string, string> = { "x-request-id": requestId() }
        const token = getAccessToken()
        if (token) headers.authorization = `Bearer ${token}`
        return headers
      },
    }),
  ],
})

export function errorMessage(error: unknown, fallback: string) {
  if (error instanceof TRPCClientError) {
    const zod = error.data?.zodError
    if (zod) {
      const fields = Object.entries(zod.fieldErrors).flatMap(
        ([field, messages]) => {
          if (!Array.isArray(messages)) return []
          return messages
            .filter((message): message is string => typeof message === "string")
            .map((message) => `${field}: ${message}`)
        }
      )
      const parts = [...zod.formErrors, ...fields]
      if (parts.length > 0) return parts.join("\n")
    }
    if (error.message) return error.message
  }
  if (error instanceof Error && error.message) return error.message
  return fallback
}

export async function invoke<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    throw new Error(errorMessage(error, "Request failed"))
  }
}
