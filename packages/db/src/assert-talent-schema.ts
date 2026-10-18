import { v7 as uuidv7 } from "uuid"
import postgres from "postgres"

import { databaseUrl } from "./env.js"

const db = postgres(databaseUrl(), { max: 1 })

const talentId = uuidv7()
const agencyId = uuidv7()

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

try {
  await seedAuthUser(talentId, `${talentId}@talent-schema.invalid`)
  await seedAuthUser(agencyId, `${agencyId}@agency-schema.invalid`)

  await db`
    insert into talent_profiles (user_id, slug, display_name)
    values (${talentId}, ${`talent-${talentId.slice(0, 8)}`}, 'Schema probe')
  `

  for (let i = 0; i < 12; i++) {
    await db`
      insert into portfolio_sections (talent_id, type, position, is_visible, config)
      values (${talentId}, 'about', ${i}, true, '{}'::jsonb)
    `
  }

  try {
    await db`
      insert into portfolio_sections (talent_id, type, position, is_visible, config)
      values (${talentId}, 'about', 99, true, '{}'::jsonb)
    `
    throw new Error("13th visible portfolio section insert succeeded; cap trigger is missing.")
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes("portfolio_sections_visible_cap_exceeded")) throw error
  }

  await db`
    insert into profile_delegates (talent_id, delegate_user_id)
    values (${talentId}, ${agencyId})
  `
  await db`
    update profile_delegates
    set revoked_at = now()
    where talent_id = ${talentId} and delegate_user_id = ${agencyId}
  `

  try {
    await db`
      update talent_profiles set user_id = ${agencyId} where user_id = ${talentId}
    `
    throw new Error("Reassigning talent profile owner succeeded; immutability trigger is missing.")
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes("talent_profile_owner_immutable")) throw error
  }

  console.log(
    "Talent schema checks passed: 12-section cap, delegate grant/revoke, owner immutability.",
  )
} finally {
  await db`delete from public.users where id in (${talentId}, ${agencyId})`
  await db`delete from auth.users where id in (${talentId}, ${agencyId})`
  await db.end()
}
