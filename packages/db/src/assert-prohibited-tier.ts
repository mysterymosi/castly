import { v7 as uuidv7 } from "uuid"
import postgres from "postgres"

import { databaseUrl } from "./env.js"

const connection = postgres(databaseUrl(), { max: 1 })

try {
  await connection`
    insert into attribute_definitions (id, key, label, data_type, tier)
    values (${uuidv7()}, 'religion', 'Religion', 'text', 'prohibited')
  `
  throw new Error("Insert of a prohibited-tier attribute succeeded; the CHECK constraint is missing.")
} catch (error) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : ""
  if (code !== "23514") throw error
  console.log("Prohibited-tier attribute insert rejected by the database (23514).")
} finally {
  await connection.end()
}
