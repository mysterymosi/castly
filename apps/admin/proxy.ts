import { NextResponse, type NextRequest } from "next/server"

import { publicApi } from "@/lib/api"
import { ACCESS_COOKIE, EXPIRES_COOKIE, needsRefresh, REFRESH_COOKIE, sessionCookies } from "@/lib/session-cookies"

/**
 * Optimistic session handling, cookies only: no session goes to sign-in, and an access token
 * about to lapse is refreshed here, the one place before rendering that can set cookies. Pages
 * still check the admin mode with the API (`requireAdmin`); this only keeps the token fresh.
 */
export async function proxy(request: NextRequest) {
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value
  if (!refreshToken) return NextResponse.redirect(new URL("/sign-in", request.url))

  const access = request.cookies.get(ACCESS_COOKIE)?.value
  if (!needsRefresh(access, request.cookies.get(EXPIRES_COOKIE)?.value)) return NextResponse.next()

  const session = await refresh(refreshToken)
  if (!session) {
    const response = NextResponse.redirect(new URL("/sign-in", request.url))
    for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, EXPIRES_COOKIE]) response.cookies.delete(name)
    return response
  }
  const cookies = sessionCookies(session)
  // The render of this same request reads the new token from the request; the browser keeps it
  // from the response.
  for (const { name, value } of cookies) request.cookies.set(name, value)
  const response = NextResponse.next({ request })
  for (const { name, value, options } of cookies) response.cookies.set(name, value, options)
  return response
}

/** A new session for the refresh token, or null when the API refuses it. */
async function refresh(refreshToken: string) {
  try {
    return await publicApi.auth.refresh.mutate({ refreshToken })
  } catch {
    return null
  }
}

export const config = {
  // Everything but sign-in and Next's own assets.
  matcher: ["/((?!sign-in|_next/static|_next/image|favicon.ico).*)"],
}
