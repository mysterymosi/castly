import Constants from "expo-constants"
import { meSchema, sessionSchema, type Me, type Session } from "@workspace/schema"

export function apiBaseUrl() {
  const configured = process.env.EXPO_PUBLIC_API_URL
  if (configured) return configured.replace(/\/$/, "")
  const host = Constants.expoConfig?.hostUri?.split(":")[0]
  return `http://${host ?? "127.0.0.1"}:3001`
}

let accessToken: string | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

type Envelope = {
  error?: { message?: string }
  result?: { data?: unknown }
}

function requestId() {
  const crypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  return crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}

async function call<T>(path: string, input: unknown, parse: (data: unknown) => T, method: "GET" | "POST") {
  const headers: Record<string, string> = { "x-request-id": requestId() }
  if (accessToken) headers.authorization = `Bearer ${accessToken}`
  let url = `${apiBaseUrl()}/trpc/${path}`
  let body: string | undefined
  if (method === "GET") {
    if (input !== undefined) {
      url += `?input=${encodeURIComponent(JSON.stringify(input))}`
    }
  } else {
    headers["content-type"] = "application/json"
    body = JSON.stringify(input)
  }
  const response = await fetch(url, { method, headers, body })
  const payload = (await response.json()) as Envelope
  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message ?? "Request failed")
  }
  return parse(payload.result?.data)
}

export const authApi = {
  requestOtp(input: { email: string; dateOfBirth: string }) {
    return call("auth.requestOtp", input, () => ({ ok: true as const }), "POST")
  },
  verifyOtp(input: { email: string; dateOfBirth: string; token: string }): Promise<Session> {
    return call("auth.verifyOtp", input, (data) => sessionSchema.parse(data), "POST")
  },
  refresh(refreshToken: string): Promise<Session> {
    return call("auth.refresh", { refreshToken }, (data) => sessionSchema.parse(data), "POST")
  },
  me(): Promise<Me> {
    return call("auth.me", undefined, (data) => meSchema.parse(data), "GET")
  },
  enableMode(mode: "talent" | "booker") {
    return call("auth.enableMode", { mode }, (data) =>
      meSchema.pick({ modes: true }).parse(data),
    "POST")
  },
}
