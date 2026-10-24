import { v7 as uuidv7 } from "uuid"
import postgres from "postgres"

import { databaseUrl } from "./env.js"

const db = postgres(databaseUrl(), { max: 1 })

const talentId = uuidv7()
const slugSuffix = talentId.slice(0, 8)
let cityId: string | undefined
let languageId: string | undefined

type SearchRow = {
  status: string
  city_id: string | null
  country: string | null
  language_ids: string[]
  rate_day_min: string | null
  has_showreel: boolean
  credit_count: number
  search_tsv: string
}

async function searchRows() {
  return db<SearchRow[]>`
    select status, city_id, country, language_ids, rate_day_min, has_showreel, credit_count,
           search_tsv::text as search_tsv
    from talent_search where talent_id = ${talentId}
  `
}

async function onlyRow() {
  const rows = await searchRows()
  if (rows.length !== 1) throw new Error(`Expected one talent_search row, found ${rows.length}`)
  return rows[0]!
}

try {
  await db`
    insert into auth.users (
      instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000', ${talentId}, 'authenticated', 'authenticated',
      ${`${talentId}@talent-search.invalid`},
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
    )
  `
  await db`
    insert into public.users (id, email, status)
    values (${talentId}, ${`${talentId}@talent-search.invalid`}, 'active')
  `
  const [city] = await db<{ id: string }[]>`
    insert into cities (slug, name, country, region)
    values (${`search-city-${slugSuffix}`}, 'Probe City', 'NG', 'south-west')
    returning id
  `
  cityId = city!.id
  const [language] = await db<{ id: string }[]>`
    insert into languages (slug, name) values (${`yoruba-${slugSuffix}`}, 'Yoruba') returning id
  `
  languageId = language!.id

  await db`
    insert into talent_profiles (user_id, slug, display_name, city_id)
    values (${talentId}, ${`tunde-${slugSuffix}`}, 'Tunde Adeyemi', ${cityId})
  `
  const draft = await onlyRow()
  if (draft.status !== "draft" || draft.country !== "NG") {
    throw new Error(`Draft projection wrong: ${JSON.stringify(draft)}`)
  }

  await db`update talent_profiles set status = 'live', published_at = now() where user_id = ${talentId}`
  const live = await onlyRow()
  if (live.status !== "live") throw new Error("Publishing did not project status = 'live'")

  await db`insert into talent_languages (talent_id, language_id) values (${talentId}, ${languageId})`
  const withYoruba = await onlyRow()
  if (!withYoruba.language_ids.includes(languageId)) {
    throw new Error("Adding Yoruba did not update language_ids")
  }
  if (!withYoruba.search_tsv.includes("'yoruba'")) {
    throw new Error("Adding Yoruba did not update search_tsv")
  }

  await db`
    insert into talent_rates (talent_id, kind, amount_min, amount_max)
    values (${talentId}, 'day', 50000, 80000)
  `
  if ((await onlyRow()).rate_day_min === null) throw new Error("Day rate was not projected")
  await db`update talent_profiles set rate_visibility = 'hidden' where user_id = ${talentId}`
  if ((await onlyRow()).rate_day_min !== null) {
    throw new Error("Hidden rate visibility still projects the day rate")
  }

  await db`
    insert into portfolio_sections (talent_id, type, position, is_visible, config)
    values (${talentId}, 'showreel', 0, true, '{}'::jsonb)
  `
  await db`insert into credits (talent_id, title) values (${talentId}, 'The Lagoon')`
  const enriched = await onlyRow()
  if (!enriched.has_showreel || enriched.credit_count !== 1) {
    throw new Error(`Showreel/credit projection wrong: ${JSON.stringify(enriched)}`)
  }

  await db`delete from talent_languages where talent_id = ${talentId}`
  if ((await onlyRow()).language_ids.length !== 0) {
    throw new Error("Removing a language did not update language_ids")
  }

  await db`update cities set country = 'GH' where id = ${cityId}`
  if ((await onlyRow()).country !== "GH") throw new Error("City country change did not propagate")

  // A handful of rows would always seq-scan; disabling it asks whether an index serves the shape.
  const plan = await db.begin(async (tx) => {
    await tx.unsafe("set local enable_seqscan = off")
    return tx.unsafe<{ "QUERY PLAN": string }[]>(
      `explain select talent_id from talent_search where status = 'live' and city_id = '${cityId}'`,
    )
  })
  const planText = plan.map((row) => row["QUERY PLAN"]).join("\n")
  if (!/talent_search_(live_idx|status_geo_idx)/.test(planText)) {
    throw new Error(`Live + city query does not use the projection indexes:\n${planText}`)
  }

  await db`delete from talent_profiles where user_id = ${talentId}`
  if ((await searchRows()).length !== 0) throw new Error("Deleting the profile left a talent_search row")

  console.log(
    "talent_search checks passed: one row per talent, incremental language/rate/section/credit/city sync, live index plan, delete cascade.",
  )
  console.log(planText)
} finally {
  await db`delete from public.users where id = ${talentId}`
  await db`delete from auth.users where id = ${talentId}`
  if (languageId) await db`delete from languages where id = ${languageId}`
  if (cityId) await db`delete from cities where id = ${cityId}`
  await db.end()
}
