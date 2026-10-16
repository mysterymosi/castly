import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import { API_ROLE, databaseApiUrl } from "./env.js"
import * as schema from "./schema/index.js"

/** Drizzle client for the tRPC server. Connects as `castly_api`, which bypasses RLS. */
export function createDb() {
  const connection = postgres(databaseApiUrl(), { max: 10 })
  return drizzle(connection, { schema })
}

export type Db = ReturnType<typeof createDb>

export async function assertApiRole(db: ReturnType<typeof createDb>) {
  const rows = await db.execute<{ db_role: string }>(sql`select current_user as db_role`)
  const role = rows[0]?.db_role
  if (role !== API_ROLE) {
    throw new Error(`API database role is ${role ?? "unknown"}, expected ${API_ROLE}`)
  }
}
