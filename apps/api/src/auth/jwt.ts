import { createRemoteJWKSet, jwtVerify } from "jose"

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined

function keySet() {
  if (!jwks) {
    const base = (process.env.SUPABASE_URL || "http://127.0.0.1:54321").replace(/\/$/, "")
    jwks = createRemoteJWKSet(new URL(`${base}/auth/v1/.well-known/jwks.json`))
  }
  return jwks
}

export async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(token, keySet(), { audience: "authenticated" })
  if (!payload.sub) throw new Error("JWT is missing a subject")
  return { userId: payload.sub }
}
