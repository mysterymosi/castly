# M4 — Booker core

**Goal.** A booker can declare what kind of work they do, then create a project with a role that carries a written brief.

**Depends on.** M1 — auth, modes, taxonomy. Does not depend on M2, but sharing `cities` and `categories` from M1 is required.

**Spec references.** PRD §6.2, §5 (Project, Role). TECH_SPEC §5.5, §5.9 (`vertical_category_weights`), §6 (`booker`, `project`, `role` except publish).

---

## Tasks

### 4.1 Booker schema

**Status:** Done — `packages/db/src/schema/booker.ts`, migration `0008_booker_core_schema.sql`. Enums `booker_vertical` (PRD §6.2 list), `project_type` (also `typical_project_types[]`), `verification_tier` (`phone|id|professional`, reusable by M7 `verifications`), `project_status` (`active|archived`). Projects and shortlists belong to `booker_profiles`, not bare users. `roles`: `is_published` false by default with `published_at` required exactly when true; `brief` is NULL or non-blank (so "has a brief" is `brief IS NOT NULL`); `requirements` must be a JSON object; shoot window as `shoot_starts_on`/`shoot_ends_on`; non-negative ordered rate range. `shortlists` is unique on `(booker_id, role_id)` NULLS NOT DISTINCT — one per role plus one general list — and cascades with its role. RLS default-deny on all five tables. CI runs `pnpm --filter @workspace/db db:assert-booker`. Not here: `vertical_category_weights` (4.3), `saved_filters` (M8).

`booker_profiles` (vertical, company_name, cac_number nullable, city_id, typical_project_types, `verification_tier` defaulting to phone). `projects`, `roles` (`brief`, `requirements jsonb`, `is_published` default false). `shortlists` and `shortlist_entries` created empty-ready so M5 does not migrate under itself.

**Acceptance.** Migrations apply. A role defaults to unpublished.

### 4.2 Booker signup and vertical profiling

**Status:** Built; device path pending a manual run. API `booker.getProfile | updateProfile | submitVerification` (`apps/api/src/booker/`), all on `bookerProcedure`, which checks the `user_modes` row server-side — the integration test sends spoofed `mode`/`x-mode` headers on a real request and gets FORBIDDEN. `updateProfile` is a full-replace upsert (vertical, optional company, active city, ≥1 unique project type); `getProfile` returns `{ profile | null, cities }`. `submitVerification` records `booker_profiles.verification_requested_at` (migration `0009`), idempotently, without changing the tier — M7's `verifications` rows replace it. Contracts and labels in `packages/schema/src/booker.ts`; schema enums are compile-checked against the DB enums. Mobile: `app/booker-setup.tsx` (full-screen stepper: kind of work → company → location → project types), opened right after enabling booker mode and from Account → "Booker profile" for edits. No verification UI yet (stub is API-only). Tests: `src/booker/booker.integration.test.ts` (in `test:integration`).

After OTP, if the user enables booker mode: pick vertical (Casting director / Producer / Director / Brand or agency / Event planner / Photographer / Content creator / Other), optional company, location, typical project types.

`booker.getProfile` / `updateProfile`. `submitVerification` is a stub that records intent; the real flow is M7.

**Acceptance.** Device path: enable booker mode → select "Casting director" + Lagos → profile persists. `booker` middleware passes. Server does not trust a `mode=booker` header without the `user_modes` row.

### 4.3 Vertical → category weights

**Status:** Done (API; admin UI deferred until the admin app has sign-in). Table `vertical_category_weights` (`booker_vertical`, `category_id`, `weight` 0–1, `updated_by`, `updated_at`; PK vertical+category; RLS default-deny; migration `0010`). Seeded in `packages/db/src/seed.ts`, insert-only so ops edits survive re-seeding, mapped onto the five launch categories (presenters, stylists, MCs, DJs, hype men have no category yet — ops add weights when they do); `other` has no rows (neutral deck). `admin.verticalWeights.list | update` behind `adminProcedure`, recording `updated_by`. The deck reads `loadVerticalCategoryWeights(db, vertical)` (`apps/api/src/booker/vertical-weights.ts`, uncached) and scores with the pure `verticalCategoryMatch(categoryIds, weights)` in `packages/core`; a core test fails if any vertical name appears in core source. Integration test `src/admin/vertical-weights.integration.test.ts` proves an admin edit is what the reader returns next.

Seed `vertical_category_weights` from PRD §6.2 / §7.2.3: casting director → actors, models, presenters; music-video-adjacent director → dancers, models, stylists; etc. Admin-editable table, no hardcoded map in ranking code.

Minimal admin mutation `admin.verticalWeights` (list + update) behind `admin` middleware, even if the UI is a simple table page.

**Acceptance.** Changing a weight in the database (or admin UI) is what a later deck query will read. No `if (vertical === 'casting_director')` in `packages/core`.

### 4.4 Projects and roles CRUD

**Status:** Built; device path pending a manual run. API `project.list | get | create | update | archive` and `role.formOptions | create | update | publish` (`apps/api/src/project/`), all `bookerProcedure` and owner-scoped (another booker's project is NOT_FOUND). `project.list` returns active projects newest-first; `includeArchived` adds archived ones. Archive is idempotent and makes the project read-only. Briefs are trimmed and blank becomes NULL. `role.publish` always returns FORBIDDEN and no input accepts `isPublished` (a smuggled field is stripped) — until M7 + M9. `requirements` are validated against active `attribute_definitions`: known key, shape by data type (number → `{min,max}`, select/text → `{anyOf}` with listed options, boolean → `{equals}`), and sensitive-tier keys only on a role with a brief. Contracts in `packages/schema/src/project.ts`. Mobile: Projects tab (`app/(tabs)/projects/`: list with setup gating, new project, project detail with archive, role form with `@expo/ui` date pickers); requirements have no editor yet (M8 filters) but edits preserve them. Tests: `src/project/project.integration.test.ts`.

`project.list | create | update | archive`. `role.create | update` with name, brief, category, shoot window, rate range, `requirements` jsonb aligned to attribute keys.

A role with a non-empty brief is what M8 will treat as allowing sensitive filters. Store the brief as a real string; empty or whitespace is not a brief.

**Acceptance.** Create project "Bank commercial — March" with role "Lead actress, 25–30, Yoruba-speaking" and a paragraph brief. Archive hides it from the default list. `is_published` cannot be flipped true yet, or if the field exists, `role.publish` is unimplemented/forbidden until M7+M9.

### 4.5 Taxonomy for on-camera attributes

**Status:** Done — launch attributes live in `packages/db/src/seed-attributes.ts` (insert-only by key). Standard: height, hair, eye colour, visible tattoos/piercings, playing age (`playing_age_min` / `playing_age_max`; a role's "25–30" is `playing_age_min ≤ 30` and `playing_age_max ≥ 25`), dress size, shoe size, experience, languages, accents. Sensitive: ethnicity, complexion (neutral `light | medium | deep`), gender, bust/chest, waist, hips. `languages` / `accents` are taxonomy-backed (`taxonomyAttributeKeys` in `@workspace/schema`): requirement values are checked against the live `languages` / `accents` tables, `role.formOptions` lists their slugs, and `talent.attributes.set` refuses them (values stay in `talent_languages` / `talent_accents`). `apps/api/src/taxonomy/attribute-policy.test.ts` (in `test:unit`) encodes the §7.3.1 tiers and fails on any tier change or prohibited-looking key, label, or option. The CI prohibited guard now scans all of `packages/db/src`, including the seed. Open: `ethnicity` keeps its M1 options (race categories); PRD asks for self-selected heritage — decide with the §7.3.1 legal/casting review.

Ensure `attribute_definitions` includes standard and sensitive keys used in briefs (height, age range, languages; complexion, gender, body measurements as sensitive). No prohibited keys.

**Acceptance.** Seed is consistent with PRD §7.3.1 tiers. CI prohibited-attribute guard still passes.

---

## Exit gate

A booker on device declares a vertical and creates a project containing a role with a written brief. Weights for that vertical exist in `vertical_category_weights` and are not hardcoded.

## Deferred

- Deck (M5)
- Professional verification and CAC upload (M7)
- `role.publish` / open board (M9)
- Saved filters (M8)
- Collaborator share links (v1 read-only share is M5/M6 if cheap; otherwise later)

## Risks

| Risk | Decision if it materialises |
|------|------------------------------|
| Vertical list from the PRD does not match how real bookers describe themselves | Keep the enum ops-extendable (`categories`-style table if needed) rather than shipping a code change for every new vertical |
