/**
 * The admin session lives in three httpOnly cookies: the API's access token, its refresh token,
 * and when the access token expires. Only the server reads them; `proxy.ts` refreshes the access
 * token before it lapses, and sign-in / sign-out set and clear them.
 */
export const ACCESS_COOKIE = "castly_admin_access"
export const REFRESH_COOKIE = "castly_admin_refresh"
export const EXPIRES_COOKIE = "castly_admin_expires"

/** Refresh this long before the access token expires, so a request never carries a dead one. */
export const REFRESH_LEEWAY_SECONDS = 60

/** How long a session lasts without a visit before the admin signs in again. */
const SESSION_DAYS = 14

type Session = { accessToken: string; refreshToken: string; expiresIn: number }

const base = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
}

/** Name, value and options for each session cookie, ready for `cookies().set`. */
export function sessionCookies(session: Session, now = Date.now()) {
  const expiresAt = Math.floor(now / 1000) + session.expiresIn
  return [
    { name: ACCESS_COOKIE, value: session.accessToken, options: { ...base, maxAge: session.expiresIn } },
    { name: REFRESH_COOKIE, value: session.refreshToken, options: { ...base, maxAge: SESSION_DAYS * 86_400 } },
    { name: EXPIRES_COOKIE, value: String(expiresAt), options: { ...base, maxAge: SESSION_DAYS * 86_400 } },
  ]
}

/** Whether the access token is missing or about to expire. */
export function needsRefresh(access: string | undefined, expires: string | undefined, now = Date.now()) {
  if (!access || !expires) return true
  return Number(expires) - REFRESH_LEEWAY_SECONDS <= now / 1000
}
