import { v7 as uuidv7 } from "uuid"
import postgres from "postgres"

import { API_ROLE, databaseApiUrl, databaseUrl } from "./env.js"

const admin = postgres(databaseUrl(), { max: 1 })
const userId = uuidv7()

try {
  await admin`
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
      ${userId},
      'authenticated',
      'authenticated',
      ${`${userId}@rls-probe.invalid`},
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(),
      now()
    )
  `
  await admin`
    insert into public.users (id, email, status)
    values (${userId}, ${`${userId}@rls-probe.invalid`}, 'active')
  `

  await admin.begin(async (tx) => {
    await tx.unsafe("set local role authenticated")
    const [row] = await tx<{ n: number }[]>`select count(*)::int as n from public.users`
    if (row?.n !== 0) {
      throw new Error(`authenticated select on users returned ${row?.n ?? "no"} rows; expected 0`)
    }
  })

  const api = postgres(databaseApiUrl(), { max: 1 })
  try {
    const [who] = await api<{ role: string }[]>`select current_user as role`
    if (who?.role !== API_ROLE) {
      throw new Error(`API connection is ${who?.role ?? "unknown"}, expected ${API_ROLE}`)
    }
    const [row] = await api<{ n: number }[]>`
      select count(*)::int as n from public.users where id = ${userId}
    `
    if (row?.n !== 1) {
      throw new Error(`castly_api select on users returned ${row?.n ?? "no"} rows; expected 1`)
    }
  } finally {
    await api.end()
  }

  console.log("authenticated select on users returned 0 rows; castly_api select returned the row.")
} finally {
  await admin`delete from public.users where id = ${userId}`
  await admin`delete from auth.users where id = ${userId}`
  await admin.end()
}
