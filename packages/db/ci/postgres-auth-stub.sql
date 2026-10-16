-- Minimal Supabase Auth stub for CI integration tests (seed-auth-user, RLS probes).
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  instance_id uuid,
  id uuid PRIMARY KEY,
  aud text,
  role text,
  email text,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  created_at timestamptz,
  updated_at timestamptz
);

DO $$
BEGIN
  CREATE ROLE anon NOLOGIN;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE ROLE authenticated NOLOGIN;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
