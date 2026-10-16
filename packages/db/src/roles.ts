import type postgres from "postgres"

import { API_ROLE } from "./env.js"

/**
 * Creates `castly_api` outside a migration transaction.
 * CREATE ROLE is illegal inside the transaction Drizzle wraps migrations in.
 * The password is applied only when provided, and never written to SQL files.
 */
export async function ensureApiRole(sql: postgres.Sql, password?: string) {
  const existing = await sql<{ rolbypassrls: boolean }[]>`
    select rolbypassrls from pg_roles where rolname = ${API_ROLE}
  `
  if (existing.length === 0) {
    await sql.unsafe(`CREATE ROLE ${API_ROLE} WITH LOGIN BYPASSRLS`)
  } else if (!existing[0]?.rolbypassrls) {
    await sql.unsafe(`ALTER ROLE ${API_ROLE} WITH LOGIN BYPASSRLS`)
  }

  if (!password) return
  if (password.includes("$castly$")) {
    throw new Error("API_DB_PASSWORD cannot contain the delimiter $castly$")
  }
  await sql.unsafe(`ALTER ROLE ${API_ROLE} WITH PASSWORD $castly$${password}$castly$`)
}
