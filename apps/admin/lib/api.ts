import "server-only"

import { createTRPCClient, httpLink, TRPCClientError, type TRPCClient } from "@trpc/client"
import type { AppRouter } from "api/router"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { apiUrl } from "@/lib/env"
import { ACCESS_COOKIE } from "@/lib/session-cookies"

type Api = TRPCClient<AppRouter>

/** A client that calls as the holder of `accessToken`, or anonymously without one. */
export function apiAs(accessToken?: string): Api {
  return createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: `${apiUrl()}/trpc`,
        headers: () => (accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        fetch: (url, init) => fetch(url, { ...init, cache: "no-store" } as RequestInit),
      }),
    ],
  })
}

/** Unauthenticated calls: signing in and refreshing a session. */
export const publicApi: Api = apiAs()

/** The API as the signed-in admin. Every admin procedure checks the admin mode itself. */
export async function adminApi(): Promise<Api> {
  return apiAs((await cookies()).get(ACCESS_COOKIE)?.value)
}

/** The API's message for a failed call, or `fallback` for anything unexpected. */
export function errorMessage(error: unknown, fallback: string) {
  if (error instanceof TRPCClientError && error.message) return error.message
  return fallback
}

/** Runs an admin call. A lapsed or missing session goes back to sign-in; other failures throw. */
export async function adminCall<T>(call: (api: Api) => Promise<T>) {
  try {
    return await call(await adminApi())
  } catch (error) {
    if (error instanceof TRPCClientError) {
      const code = error.data?.code
      if (code === "UNAUTHORIZED") redirect("/sign-in")
      if (code === "FORBIDDEN") redirect("/sign-in?reason=not-admin")
    }
    throw error
  }
}
