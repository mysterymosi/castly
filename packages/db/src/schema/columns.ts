import { sql } from "drizzle-orm"
import { timestamp, uuid } from "drizzle-orm/pg-core"
import { v7 as uuidv7 } from "uuid"

/** Time-ordered UUID v7. The SQL default covers raw inserts; `$defaultFn` covers Drizzle inserts. */
export function primaryUuid() {
  return uuid("id")
    .primaryKey()
    .default(sql`uuid_generate_v7()`)
    .$defaultFn(() => uuidv7())
}

export function timestamptz(name: string) {
  return timestamp(name, { withTimezone: true, mode: "date" })
}
