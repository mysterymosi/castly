/**
 * Flips pending interests past their expiry to `expired`. Safe to run on any schedule and from
 * more than one place: a second run finds nothing left to change. `interest.accept` and
 * `interest.decline` enforce expiry themselves, so a late run delays nothing a talent can do.
 *
 *   pnpm --filter api interest:expire
 */
import { db } from "../db.js"
import { expireInterests } from "../interest/service.js"

const expired = await expireInterests(db)
console.log(`Expired ${expired} interest${expired === 1 ? "" : "s"}.`)
process.exit(0)
