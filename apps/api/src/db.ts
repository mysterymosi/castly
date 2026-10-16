import { assertApiRole, createDb, type Db } from "@workspace/db"

/** The only database connection the tRPC server uses. */
export const db: Db = createDb()

await assertApiRole(db)
