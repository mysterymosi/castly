import { fileURLToPath } from "node:url"

import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"

import { apiDbPassword, databaseUrl } from "./env.js"
import { ensureApiRole } from "./roles.js"

const connection = postgres(databaseUrl(), { max: 1 })

await ensureApiRole(connection, process.env.API_DB_PASSWORD ? apiDbPassword() : undefined)

await migrate(drizzle(connection), {
  migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
})
await connection.end()
