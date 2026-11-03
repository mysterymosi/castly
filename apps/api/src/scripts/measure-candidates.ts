/**
 * Stage 1 latency against its TECH_SPEC §7.1 budget (p95 < 120ms) on a Lagos-sized pool. Seeds
 * synthetic live talents (plus a booker with swipes and blocks) inside one transaction, runs
 * `EXPLAIN ANALYZE` on the exact `candidateQuery` the deck uses, then rolls everything back:
 *
 *   pnpm --filter api measure:candidates            # 1,200 talents
 *   pnpm --filter api measure:candidates -- 5000    # a larger pool
 *
 * Needs the admin `DATABASE_URL` (it writes `auth.users`); never point it at production.
 */
import { randomUUID } from "node:crypto"

import { LOCAL_DATABASE_URL, loadEnv, schema } from "@workspace/db"
import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import { candidateQuery, resolveCandidateScope, type CandidateScope } from "../deck/candidates.js"
import { newSeed } from "../deck/session.js"

loadEnv()

// `pnpm … -- 5000` forwards the `--` too.
const POOL = Number(process.argv.slice(2).find((arg) => arg !== "--") ?? 1200)
const RUNS = 50
const BUDGET_MS = 120

const connection = postgres(process.env.DATABASE_URL ?? LOCAL_DATABASE_URL, {
  max: 1,
  onnotice: () => {},
})
const admin = drizzle(connection, { schema })

class Rollback extends Error {}

type Plan = [{ "Planning Time": number; "Execution Time": number; Plan: { "Actual Rows": number } }]

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!
}

try {
  await admin.transaction(async (tx) => {
    const run = randomUUID().slice(0, 8)
    const [city] = await tx
      .insert(schema.cities)
      .values({ slug: `measure-lagos-${run}`, name: "Lagos", country: "NG", region: "south-west" })
      .returning({ id: schema.cities.id })
    const categoryIds = (await tx.select({ id: schema.categories.id }).from(schema.categories)).map(
      (row) => row.id,
    )
    if (categoryIds.length === 0) throw new Error("No categories. Run pnpm db:seed first.")

    // Talents: users, live profiles in Lagos, one category each. The profile and category
    // triggers write `talent_search`; quality is rounded so ties are common, as in production.
    await tx.execute(sql`
      with ids as (
        select gen_random_uuid() as id, n from generate_series(1, ${POOL}) as n
      ), auth_rows as (
        insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data,
                                raw_user_meta_data, created_at, updated_at)
        select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated',
               'measure-' || id || '@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now()
        from ids
        returning id
      ), user_rows as (
        insert into public.users (id, email, date_of_birth, status)
        select id, 'measure-' || id || '@example.invalid', '1990-01-01', 'active' from auth_rows
        returning id
      )
      insert into public.talent_profiles (user_id, slug, display_name, city_id, status, published_at)
      select id, 'measure-' || id, 'Measure Talent', ${city!.id}, 'live', now() from user_rows
    `)
    await tx.execute(sql`
      insert into public.talent_categories (talent_id, category_id, is_primary)
      select tp.user_id, (string_to_array(${categoryIds.join(",")}, ',')::uuid[])[1 + floor(random() * ${categoryIds.length})::int], true
      from public.talent_profiles tp
      where tp.slug like 'measure-%' and tp.city_id = ${city!.id}
    `)
    await tx.execute(sql`
      update public.talent_search
      set quality_score = round(random() * 20) * 5
      where city_id = ${city!.id}
    `)

    // A booker with a role, 300 swipes on it, and 20 blocks — the anti-joins stage 1 runs.
    const bookerId = randomUUID()
    await tx.execute(sql`
      insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data,
                              raw_user_meta_data, created_at, updated_at)
      values ('00000000-0000-0000-0000-000000000000', ${bookerId}, 'authenticated', 'authenticated',
              ${`measure-booker-${run}@example.invalid`}, '{}'::jsonb, '{}'::jsonb, now(), now())
    `)
    await tx
      .insert(schema.users)
      .values({ id: bookerId, email: `measure-booker-${run}@example.invalid`, dateOfBirth: "1990-01-01" })
    await tx
      .insert(schema.bookerProfiles)
      .values({ userId: bookerId, vertical: "casting_director", cityId: city!.id })
    const [project] = await tx
      .insert(schema.projects)
      .values({ bookerId, name: "Measure" })
      .returning({ id: schema.projects.id })
    const [role] = await tx
      .insert(schema.roles)
      .values({ projectId: project!.id, name: "Lead", categoryId: categoryIds[0]! })
      .returning({ id: schema.roles.id })
    await tx.execute(sql`
      insert into public.swipes (booker_id, talent_id, role_id, direction)
      select ${bookerId}, talent_id, ${role!.id}, 'pass'
      from public.talent_search where city_id = ${city!.id} limit 300
    `)
    await tx.execute(sql`
      insert into public.blocks (blocker_id, blocked_id)
      select ${bookerId}, talent_id
      from public.talent_search where city_id = ${city!.id} offset 300 limit 20
    `)
    await tx.execute(sql`analyze public.talent_search, public.swipes, public.blocks`)

    const [live] = await tx.execute<{ n: number }>(
      sql`select count(*)::int as n from public.talent_search where status = 'live'`,
    )
    console.log(`live talents: ${live!.n} (${POOL} synthetic), ${RUNS} runs per scenario\n`)

    const scenarios: [string, CandidateScope][] = [
      ["vertical default", await resolveCandidateScope(tx, bookerId, null, {}, newSeed())],
      ["role + swipes", await resolveCandidateScope(tx, bookerId, role!.id, {}, newSeed())],
      [
        "role + filters",
        await resolveCandidateScope(
          tx,
          bookerId,
          role!.id,
          { cityIds: [city!.id], regions: ["south-west"], rateDayMax: 150000 },
          newSeed(),
        ),
      ],
    ]

    let failed = false
    console.log("scenario            rows   p50 ms   p95 ms   max ms   pass")
    for (const [name, scope] of scenarios) {
      const times: number[] = []
      let rows = 0
      for (let i = 0; i < RUNS; i++) {
        const [result] = await tx.execute<{ "QUERY PLAN": Plan }>(
          sql`explain (analyze, format json) ${candidateQuery(tx, { ...scope, seed: newSeed() })}`,
        )
        const plan = result!["QUERY PLAN"][0]
        times.push(plan["Planning Time"] + plan["Execution Time"])
        rows = plan.Plan["Actual Rows"]
      }
      const p95 = percentile(times, 95)
      if (p95 >= BUDGET_MS) failed = true
      console.log(
        `${name.padEnd(18)} ${String(rows).padStart(5)} ${percentile(times, 50).toFixed(2).padStart(8)} ` +
          `${p95.toFixed(2).padStart(8)} ${Math.max(...times).toFixed(2).padStart(8)}   ${p95 < BUDGET_MS ? "yes" : "NO"}`,
      )
    }

    const plan = await tx.execute<{ "QUERY PLAN": string }>(
      sql`explain (analyze, costs off, timing off) ${candidateQuery(tx, scenarios[1]![1])}`,
    )
    console.log(`\nPlan (role + swipes):\n${plan.map((row) => row["QUERY PLAN"]).join("\n")}`)
    console.log(failed ? "\nOVER BUDGET" : `\nAll scenarios under ${BUDGET_MS}ms p95.`)
    throw new Rollback()
  })
} catch (error) {
  if (!(error instanceof Rollback)) throw error
} finally {
  await connection.end()
}
