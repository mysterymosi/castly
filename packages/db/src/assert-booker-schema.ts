import { v7 as uuidv7 } from "uuid"
import postgres from "postgres"

import { databaseUrl } from "./env.js"

const db = postgres(databaseUrl(), { max: 1, onnotice: () => {} })

const bookerId = uuidv7()
const talentId = uuidv7()

async function seedAuthUser(id: string, email: string) {
  await db`
    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      ${id},
      'authenticated',
      'authenticated',
      ${email},
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(),
      now()
    )
  `
  await db`
    insert into public.users (id, email, status)
    values (${id}, ${email}, 'active')
  `
}

/** Runs `write` and requires it to fail on the named constraint. */
async function expectRejected(constraint: string, write: () => Promise<unknown>) {
  try {
    await write()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes(constraint)) return
    throw error
  }
  throw new Error(`Write succeeded; expected ${constraint} to reject it.`)
}

try {
  await seedAuthUser(bookerId, `${bookerId}@booker-schema.invalid`)
  await seedAuthUser(talentId, `${talentId}@booker-schema.invalid`)

  const [profile] = await db<{ verification_tier: string; typical_project_types: string[] }[]>`
    insert into booker_profiles (user_id, vertical)
    values (${bookerId}, 'casting_director')
    returning verification_tier, typical_project_types
  `
  if (profile?.verification_tier !== "phone" || profile.typical_project_types.length !== 0) {
    throw new Error(`booker_profiles defaults wrong: ${JSON.stringify(profile)}`)
  }

  const [project] = await db<{ id: string; status: string }[]>`
    insert into projects (booker_id, name, type)
    values (${bookerId}, 'Bank commercial — March', 'commercial')
    returning id, status
  `
  if (project?.status !== "active") throw new Error(`project status default: ${project?.status}`)

  const [role] = await db<
    { id: string; is_published: boolean; published_at: Date | null; requirements: unknown }[]
  >`
    insert into roles (project_id, name, brief)
    values (${project.id}, 'Lead actress, 25–30, Yoruba-speaking', 'Warm, confident, natural on camera.')
    returning id, is_published, published_at, requirements
  `
  if (!role || role.is_published || role.published_at !== null) {
    throw new Error(`role must default to unpublished: ${JSON.stringify(role)}`)
  }
  if (JSON.stringify(role.requirements) !== "{}") {
    throw new Error(`role requirements default: ${JSON.stringify(role.requirements)}`)
  }

  await expectRejected("roles_brief_not_blank", () =>
    db`insert into roles (project_id, name, brief) values (${project.id}, 'Extra', '   ')`,
  )
  await expectRejected("roles_name_not_blank", () =>
    db`insert into roles (project_id, name) values (${project.id}, '  ')`,
  )
  await expectRejected("roles_published_at_matches", () =>
    db`update roles set is_published = true where id = ${role.id}`,
  )
  await expectRejected("roles_rate_range", () =>
    db`update roles set rate_min = 200000, rate_max = 100000 where id = ${role.id}`,
  )
  await expectRejected("roles_requirements_object", () =>
    db`update roles set requirements = '[]'::jsonb where id = ${role.id}`,
  )
  await expectRejected("roles_shoot_window_order", () =>
    db`update roles set shoot_starts_on = '2027-03-10', shoot_ends_on = '2027-03-01' where id = ${role.id}`,
  )

  await db`insert into shortlists (booker_id, name) values (${bookerId}, 'Saved talent')`
  await expectRejected("shortlists_booker_role_key", () =>
    db`insert into shortlists (booker_id, name) values (${bookerId}, 'Saved talent 2')`,
  )
  const [roleList] = await db<{ id: string }[]>`
    insert into shortlists (booker_id, role_id, name)
    values (${bookerId}, ${role.id}, 'Lead actress')
    returning id
  `
  await db`
    insert into talent_profiles (user_id, slug, display_name)
    values (${talentId}, ${`talent-${talentId.slice(0, 8)}`}, 'Schema probe')
  `
  await db`insert into shortlist_entries (shortlist_id, talent_id) values (${roleList!.id}, ${talentId})`

  // Deleting the role removes its shortlist and entries; the general list is untouched.
  await db`delete from roles where id = ${role.id}`
  const [left] = await db<{ lists: number; entries: number }[]>`
    select
      (select count(*)::int from shortlists where booker_id = ${bookerId}) as lists,
      (select count(*)::int from shortlist_entries where talent_id = ${talentId}) as entries
  `
  if (left?.lists !== 1 || left.entries !== 0) {
    throw new Error(`role delete cascade wrong: ${JSON.stringify(left)}`)
  }

  await db.begin(async (tx) => {
    await tx.unsafe("set local role authenticated")
    const [visible] = await tx<{ n: number }[]>`
      select (
        (select count(*) from booker_profiles) + (select count(*) from projects) +
        (select count(*) from roles) + (select count(*) from shortlists) +
        (select count(*) from shortlist_entries)
      )::int as n
    `
    if (visible?.n !== 0) throw new Error(`authenticated sees ${visible?.n} booker rows; expected 0`)
  })

  console.log(
    "Booker schema checks passed: defaults (role unpublished), brief/name/rate/window/publish constraints, one general shortlist per booker, role delete cascade, default-deny RLS.",
  )
} finally {
  await db`delete from public.users where id in (${bookerId}, ${talentId})`
  await db`delete from auth.users where id in (${bookerId}, ${talentId})`
  await db.end()
}
