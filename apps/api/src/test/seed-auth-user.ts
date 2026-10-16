import { randomUUID } from "node:crypto"

import { loadEnv, LOCAL_DATABASE_URL } from "@workspace/db"
import postgres from "postgres"

loadEnv()

const adminUrl = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL
const admin = postgres(adminUrl, { max: 1 })

export async function seedAuthUser(emailSuffix: string, dateOfBirth: string) {
  const id = randomUUID()
  const email = `middleware-${emailSuffix}@example.com`
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
  await admin`
    insert into public.users (id, email, date_of_birth, status)
    values (${id}, ${email}, ${dateOfBirth}, 'active')
  `
  return id
}

export async function deleteAuthUser(id: string) {
  await admin`delete from public.users where id = ${id}`
  await admin`delete from auth.users where id = ${id}`
}
