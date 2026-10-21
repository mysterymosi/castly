import { OtpRateLimited } from "./rate-limit.js"

/** Shown for a wrong, expired, or absent code. Same text whether or not the email is registered. */
export const INVALID_OTP_MESSAGE = "That code is invalid or has expired."

export class AuthRejected extends Error {
  constructor(message = "That sign-in attempt was not accepted.") {
    super(message)
    this.name = "AuthRejected"
  }
}

export type AuthSession = {
  accessToken: string
  refreshToken: string
  expiresIn: number
  userId: string
  email: string
}

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

function authHeaders() {
  const key = required("SUPABASE_SECRET_KEY")
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  }
}

function baseUrl() {
  return (process.env.SUPABASE_URL || "http://127.0.0.1:54321").replace(
    /\/$/,
    ""
  )
}

async function readError(response: Response, clientMessage?: string) {
  if (response.status === 429) throw new OtpRateLimited(60)
  if (response.status >= 400 && response.status < 500) {
    throw new AuthRejected(clientMessage)
  }
  throw new Error(`Supabase auth failed (${response.status})`)
}

function sessionFrom(
  body: {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    user?: { id?: string; email?: string | null }
  },
  fallbackEmail: string
): AuthSession {
  if (
    !body.access_token ||
    !body.refresh_token ||
    !body.user?.id ||
    body.expires_in == null
  ) {
    throw new Error("Supabase auth returned an incomplete session")
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresIn: body.expires_in,
    userId: body.user.id,
    email: body.user.email || fallbackEmail,
  }
}

export const supabaseAuth = {
  async requestOtp(email: string) {
    const response = await fetch(`${baseUrl()}/auth/v1/otp`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ email, create_user: true }),
    })
    if (!response.ok) await readError(response)
  },

  async verifyOtp(email: string, token: string) {
    const response = await fetch(`${baseUrl()}/auth/v1/verify`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ type: "email", email, token }),
    })
    if (!response.ok) await readError(response, INVALID_OTP_MESSAGE)
    return sessionFrom(
      (await response.json()) as Parameters<typeof sessionFrom>[0],
      email
    )
  },

  async refresh(refreshToken: string) {
    const response = await fetch(
      `${baseUrl()}/auth/v1/token?grant_type=refresh_token`,
      {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ refresh_token: refreshToken }),
      }
    )
    if (!response.ok) await readError(response)
    return sessionFrom(
      (await response.json()) as Parameters<typeof sessionFrom>[0],
      ""
    )
  },
}

export type AuthClient = typeof supabaseAuth
