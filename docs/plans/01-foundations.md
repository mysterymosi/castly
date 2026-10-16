# M1 — Foundations

**Goal.** A signed-in user on a physical device can call an authed tRPC procedure, against a typed Postgres schema, with CI green.

**Depends on.** Nothing. This is the first milestone.

**Spec references.** TECH_SPEC §2–§5.2, §6 (middleware ladder), §12, §20.2–§20.3, §21 (Sentry), §22.1, §23. PRD §4.1 (modes, not identity), §6.1 step 1 (phone OTP).

---

## Tasks

### 1.1 Monorepo skeleton

Create the Turborepo + pnpm workspace from TECH_SPEC §4:

- `apps/mobile` — Expo SDK 57, expo-router, RN 0.86, NativeWind 4, Reanimated 4.5, Gesture Handler 2.32
- `apps/web` — Next.js App Router (placeholder route)
- `apps/admin` — Next.js App Router (placeholder route)
- `apps/api` — Node 22, tRPC v11, Hono for raw HTTP
- `packages/schema`, `packages/db`, `packages/core`, `packages/ui-tokens`, `packages/portfolio-native`, `packages/portfolio-web`, `packages/config`

**Acceptance.** `pnpm install` and `turbo typecheck` succeed from the repo root. Each package has a tsconfig that extends `packages/config`. Node engines field is `>=22.13.0`.

### 1.2 Drizzle schema — identity and taxonomy

In `packages/db`, define and migrate:

- `users` (uuid v7, mirrors `auth.users.id`), `user_modes` (`talent | booker | admin`), `device_tokens`
- `categories`, `attribute_definitions` (tier enum includes `prohibited`), `skills`, `languages`, `accents`, `cities`
- `feature_flags`, `ranking_weights` (empty-ready tables so later milestones do not need a schema fork)

Conventions: `timestamptz`, `snake_case`, RLS enabled default-deny on every table. API role bypasses RLS.

CHECK constraint: no `attribute_definitions` row may have `tier = 'prohibited'`.

Seed launch categories from PRD §11.1 (actors, models, dancers, makeup & hair, photographers/cinematographers) plus the taxonomy tables needed for attributes.

**Acceptance.** `drizzle-kit migrate` applies cleanly against local Supabase Postgres. A seed script inserts the launch categories. Attempting to insert a prohibited-tier attribute fails at the database.

### 1.3 Default-deny RLS and API database role

Enable RLS on every table. Grant `anon` and `authenticated` nothing except what later milestones will widen for Realtime (leave comments, do not grant chat tables yet). Create an API role that bypasses RLS and is the only role the tRPC server uses.

**Acceptance.** Connecting as `authenticated` and selecting from `users` returns zero rows. Connecting as the API role can select. Secrets for both roles live outside the repo.

### 1.4 Supabase Auth + Termii OTP

Phone OTP primary. Custom SMS hook: Termii WhatsApp OTP first, SMS fallback. Tokens stored in `expo-secure-store` on mobile. API validates JWTs against Supabase JWKS with `jose`.

Collect date of birth at signup; reject under-18 (PRD §7.6). Email/Google/Apple deferred.

`auth` router: `requestOtp`, `verifyOtp`, `refresh`, `me`, `enableMode`. `enableMode` writes `user_modes`; the server never trusts a client-asserted mode on later procedures.

Rate-limit OTP request per phone and per IP.

**Acceptance.** On a physical device: request OTP to a Nigerian number, receive via WhatsApp or SMS, verify, receive a session. Subsequent `me` calls succeed. A second `requestOtp` burst is rate-limited. An under-18 date of birth is rejected.

### 1.5 tRPC middleware ladder

**Status:** Done — `apps/api/src/trpc/trpc.ts` exports the ladder; `access.*Ping` probes exercise each gate in integration tests.

Procedures declare one of: `public`, `authed`, `talent`, `booker`, `verifiedBooker`, `admin`.

- `authed` — valid JWT
- `talent` / `booker` — corresponding `user_modes` row exists (not which screen the client is showing)
- `verifiedBooker` — stub that currently equals `booker`; M7 replaces the body
- `admin` — `user_modes.mode = 'admin'`

Propagate a request ID from client through API logs.

**Acceptance.** Integration tests: unauthenticated call to `authed` fails; user with only talent mode cannot pass `booker` middleware; `enableMode('booker')` then allows `booker` procedures. `verifiedBooker` is documented as a stub.

### 1.6 Sentry

**Status:** Done — `@sentry/node` (API), `@sentry/react-native` (mobile), no-op `apps/web/lib/sentry.ts`. Release from `SENTRY_RELEASE` or git SHA on the API. tRPC `onError` tags `request_id`; JSON request logs already carry `requestId`.

Sentry on mobile, API, and a no-op web placeholder. Release names will later tie to EAS; for now use git SHA. Structured JSON logs include the request ID.

**Acceptance.** A thrown error in a tRPC procedure appears in Sentry with the request ID. A thrown error in the Expo app appears in the same project.

### 1.7 CI

**Status:** Done — `.github/workflows/ci.yml` (six jobs), `scripts/ci/prohibited-attribute-guard.mjs`, `packages/db/ci/postgres-auth-stub.sql`, `db:check` migration drift script.

GitHub Actions on every PR:

1. typecheck
2. lint
3. unit tests (Vitest)
4. integration tests against ephemeral Postgres (testcontainers or a service container)
5. Drizzle migration check (generate is clean, no pending diffs)
6. **Prohibited-attribute guard** — fail the build if banned keys (religion, health, disability, marital status, sexual orientation, pregnancy, HIV) appear in schema files, migrations, or `packages/schema`

**Acceptance.** A PR that adds `religion` as an attribute key fails CI. A PR with a pending Drizzle diff fails CI. A green PR means all six jobs passed.

### 1.8 Local environment

**Status:** Done — root `README.md` (prerequisites, env table, Supabase, migrate, dev), `.env.example`, `apps/mobile/.env.example`.

`supabase start` + Docker for local Postgres. `.env.example` lists every required secret with empty values. README covers `pnpm install`, `supabase start`, `pnpm db:migrate`, `pnpm dev`.

**Acceptance.** A second checkout following only the README reaches a running API and Expo dev client.

---

## Exit gate

A physical device completes phone OTP, holds a session in secure store, and successfully calls `auth.me`. CI is green on main, including the prohibited-attribute guard. RLS default-deny holds for the `authenticated` role.

## Deferred

- Talent and booker profile tables beyond identity (M2, M4)
- Chat RLS grants (M6)
- Smile ID, professional verification (M7)
- Email / Google / Apple login
- EAS production builds (needed by M11, optional earlier)
- Agency `profile_delegates` table (schema-level owner rule can be added in M2 when talent profiles exist)

## Risks

| Risk | Decision if it materialises |
|------|------------------------------|
| Termii WhatsApp OTP deliverability is poor on the test numbers | Switch default to SMS and keep WhatsApp as fallback; do not block the milestone |
| Expo SDK 57 / RN 0.86 surprises on the 2GB test device | Stay on 57, file the constraint, do not downgrade without a written reason |
