import postgres from "postgres"

import { apiDbPassword, databaseUrl } from "./env.js"
import { ensureApiRole } from "./roles.js"

const connection = postgres(databaseUrl(), { max: 1 })

await ensureApiRole(connection, apiDbPassword())
console.log("castly_api password set from API_DB_PASSWORD.")
await connection.end()
