import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

/** Local Supabase Postgres, from `supabase start`. Migration role, not the API. */
export const LOCAL_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

/** Role the tRPC server connects as. Bypasses RLS. */
export const API_ROLE = "castly_api"

export function loadEnv() {
  const envPath = resolve(import.meta.dirname, "../../../.env")
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed)
    const key = match?.[1]
    const raw = match?.[2]
    if (!key || raw === undefined || process.env[key]) continue
    process.env[key] = raw.replace(/^["']|["']$/g, "")
  }
}

export function databaseUrl() {
  loadEnv()
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(`DATABASE_URL is not set. For local Supabase use ${LOCAL_DATABASE_URL}`)
  }
  return url
}

/** Connection string for `castly_api`. Never the migration superuser. */
export function databaseApiUrl() {
  loadEnv()
  const url = process.env.DATABASE_API_URL
  if (!url) {
    throw new Error(
      "DATABASE_API_URL is not set. The API must connect as castly_api. Set API_DB_PASSWORD and run pnpm db:provision-api-role.",
    )
  }
  return url
}

export function apiDbPassword() {
  loadEnv()
  const password = process.env.API_DB_PASSWORD
  if (!password) {
    throw new Error("API_DB_PASSWORD is not set. Keep it in .env, not in the repo.")
  }
  return password
}
