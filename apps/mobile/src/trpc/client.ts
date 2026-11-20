import Constants from "expo-constants"
import { TurboModuleRegistry, type TurboModule } from "react-native"
import {
  createTRPCClient,
  httpBatchLink,
  TRPCClientError,
  type TRPCClient,
} from "@trpc/client"
import type { AppRouter } from "api/router"

import { getAccessToken } from "@/auth/token"
import { randomUUID } from "@/lib/uuid"

// Native dev builds can get Metro's host from the bundle URL when hostUri is missing.
// The native registry is absent during web export.
interface SourceCodeModule extends TurboModule {
  getConstants(): { scriptURL?: string }
}

function devServerHost() {
  const sourceCode = TurboModuleRegistry?.get<SourceCodeModule>("SourceCode")
  const scriptURL = sourceCode?.getConstants().scriptURL
  return scriptURL?.match(/^https?:\/\/([^:/]+)/)?.[1]
}

export function apiBaseUrl() {
  const configured = process.env.EXPO_PUBLIC_API_URL
  if (configured) return configured.replace(/\/$/, "")
  const host = Constants.expoConfig?.hostUri?.split(":")[0] ?? devServerHost()
  return `http://${host ?? "127.0.0.1"}:3001`
}

export const trpc: TRPCClient<AppRouter> = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${apiBaseUrl()}/trpc`,
      headers() {
        const headers: Record<string, string> = { "x-request-id": randomUUID() }
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
