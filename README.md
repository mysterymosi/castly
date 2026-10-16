# Castly

Swipe-based talent discovery. Monorepo: **pnpm** workspaces + **Turborepo**.

## Apps

| Path | Role |
|------|------|
| `apps/mobile` | Expo SDK 57 (sign-in, talent/booker modes) |
| `apps/api` | tRPC + Hono (port **3001**) |
| `apps/web` | Public portfolios (Next.js) |
| `apps/admin` | Ops console (Next.js, port **3002**) |

Shared packages: `packages/schema`, `packages/db`, `packages/core`, `packages/ui`, etc.

## Prerequisites

- **Node.js** `>=22.13.0` (see `package.json` `engines`)
- **pnpm** `10.x` (`corepack enable` or install from [pnpm.io](https://pnpm.io))
- **Docker Desktop** (or another Docker engine) for local Supabase Postgres
- **Supabase CLI** — [install guide](https://supabase.com/docs/guides/local-development/cli/getting-started)
- **Expo Go** on a phone/simulator for the mobile app (optional: iOS Simulator / Android emulator)

## Local development (first checkout)

### 1. Install dependencies

From the repo root:

```bash
pnpm install
```

### 2. Environment files

Copy the example env and fill in secrets (never commit `.env`):

```bash
cp .env.example .env
```

**Required for a working sign-in flow**

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres superuser URL for migrations. Local default: `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| `API_DB_PASSWORD` | Password you choose for the `castly_api` role |
| `DATABASE_API_URL` | API connection string, e.g. `postgresql://castly_api:<API_DB_PASSWORD>@127.0.0.1:54322/postgres` |
| `SUPABASE_URL` | `http://127.0.0.1:54321` (local Auth API) |
| `SUPABASE_SECRET_KEY` | From `supabase status` after start (secret / service role key for the API) |
| `RESEND_API_KEY` | [Resend](https://resend.com) API key — local Auth sends email OTP via SMTP (`supabase/config.toml`) |
| `SEND_SMS_HOOK_SECRETS` | Standard Webhooks secret (`v1,whsec_…`) — required in `.env` when `supabase start` loads `config.toml` even if the SMS hook is disabled |

Generate a webhook secret (example):

```bash
echo "v1,whsec_$(openssl rand -base64 32)"
```

**Optional**

- `EXPO_PUBLIC_API_URL` — leave empty on device/simulator; Expo uses the dev machine IP. Set if the app cannot reach the API.
- `SENTRY_*` / `EXPO_PUBLIC_SENTRY_*` — error reporting; omit to disable locally.
- `SENTRY_PROBE=1` — makes tRPC `health` throw for Sentry testing (API only).
- Termii vars — only if phone/SMS sign-in is re-enabled.

Mobile Sentry (optional): copy `apps/mobile/.env.example` to `apps/mobile/.env` and set `EXPO_PUBLIC_SENTRY_DSN`.

### 3. Start Supabase (Postgres + Auth)

Docker must be running. From the repo root (so `config.toml` and root `.env` are picked up):

```bash
supabase start
```

Note the **API URL** and **Secret key** from the CLI output, or run:

```bash
supabase status
```

Put the secret key in `.env` as `SUPABASE_SECRET_KEY`.

### 4. Database migrate and API role

```bash
pnpm db:migrate
pnpm db:provision-api-role
```

Optional seed data (launch categories):

```bash
pnpm db:seed
```

### 5. Run the stack

All apps (API, mobile, web, admin):

```bash
pnpm dev
```

Common split terminals:

```bash
pnpm dev --filter api      # http://127.0.0.1:3001
pnpm dev --filter mobile   # Expo dev server — scan QR or press i/a
```

- API health: `curl http://127.0.0.1:3001/health`
- Mobile home tab: email OTP sign-in (18+), then enable talent/booker modes.

### 6. Verify

```bash
pnpm typecheck
pnpm test
```

CI runs the same checks on pull requests (see `.github/workflows/ci.yml`).

## Troubleshooting

| Issue | Check |
|-------|--------|
| API fails on startup (`DATABASE_API_URL`, role) | Run `pnpm db:migrate` then `pnpm db:provision-api-role`; match password in `DATABASE_API_URL` |
| Email OTP never arrives | `RESEND_API_KEY` in root `.env`; restart `supabase start`; Resend sandbox only delivers to your Resend account inbox until a domain is verified |
| Mobile cannot reach API | Same Wi‑Fi as dev machine, or set `EXPO_PUBLIC_API_URL=http://<your-lan-ip>:3001` in `apps/mobile/.env` |
| `supabase start` fails on env | Root `.env` must define every `env(...)` reference in `supabase/config.toml` for enabled features |

## Other scripts

```bash
pnpm lint
pnpm format
pnpm db:seed
pnpm ci:prohibited-guard
```

## shadcn/ui (web + admin)

```bash
pnpm dlx shadcn@latest add button -c apps/web
```

Import from `@workspace/ui/components/button`.

## Plans

Milestone breakdown: [`docs/plans/01-foundations.md`](docs/plans/01-foundations.md) and [`docs/plans/README.md`](docs/plans/README.md).
