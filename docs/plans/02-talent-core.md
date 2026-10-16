# M2 — Talent core

**Goal.** A talent can build a portfolio on device, upload media over a flaky connection, and publish it. The search projection stays in sync.

**Depends on.** M1 — auth, `user_modes`, taxonomy tables, tRPC ladder, CI.

**Spec references.** PRD §6.1, §7.1. TECH_SPEC §5.3–§5.4, §5.10, §6 (`talent`, `media`), §6.1 stub, §7.5 completeness, §9, §11.

---

## Tasks

### 2.1 Talent schema

Tables: `talent_profiles`, `talent_categories`, `talent_attributes`, `talent_skills`, `talent_languages`, `talent_accents`, `credits`, `talent_rates`, `talent_availability`, `training`, `affiliations`, `press`, `testimonials`, `social_links`, `portfolio_sections`, `section_media`, `media_assets`.

`rate_visibility` on the profile (`public | verified_bookers | hidden`). Trigger: at most 12 visible `portfolio_sections` per talent.

`profile_delegates` (agency grant): talent is always owner; no column or constraint allows an agency to become owner.

**Acceptance.** Migrations apply. Inserting a 13th visible section fails. A delegate can be granted and revoked; owner_id cannot be reassigned to the agency.

### 2.2 Section schema and forward-migrators

In `packages/schema`, a Zod discriminated union on `type`, versioned per type. Core set for this milestone:

- hero, about, gallery, showreel, credits, attributes, skills, languages, rates, availability

Audio, training, affiliations, press, testimonials, social, custom may be stubbed as types that validate and persist but have a minimal native renderer.

Each type registers `schemaVersion` and a forward-migrator map. Readers always migrate to current in memory. A pg-boss job rewrites rows opportunistically. API validates `config` on every write against `(type, schema_version)`. Reads never trust stored JSON without running migrators.

**Acceptance.** A fixture row at `schemaVersion: 1` is readable as current. A contract test covers round-trip and forward migration. Writing invalid config is rejected. No blocking SQL rewrite of `config` is part of deploy.

### 2.3 Native renderers and height estimates

`packages/portfolio-native`: one renderer per core type. Each exports `estimateHeight(config, mediaMeta)`. A type without an estimator cannot be imported into the studio.

Render at card width. FlashList consumes the estimated heights.

**Acceptance.** Unit tests assert every shipped type exports `estimateHeight`. Live preview on device shows all core types at card width without horizontal overflow.

### 2.4 Studio UI

Guided quick-start (name, location, 3 photos, one-line bio, top 3 skills) then the open studio: add / hide / reorder sections, pick a template (Editorial, Reel-first, Case study), live preview of portfolio and of the decision-layer card (lead media + three highlight facts).

Card configuration persisted on the profile.

Completeness meter: weighted by category; **sensitive attribute fields excluded**. Publishing allowed once quick-start minimum is met.

**Acceptance.** Maestro (or manual device) path: signup → quick-start → add showreel section → reorder → preview → completeness increases when a showreel is added, does not increase when ethnicity is filled. Templates apply block order in one step.

### 2.5 Media pipeline

1. Client compresses images via `expo-image-manipulator`; video uploaded as captured.
2. `media.createUploadUrl` creates `media_assets` at `pending` and returns a single-use signed tus URL (Cloudflare Images or Stream).
3. Direct tus upload; webhook → `processing` → `ready` with dimensions, duration, poster, playback ids, blurhash.
4. Image variants: `card`, `thumb`, `full`, `og`.
5. Reaching `ready` enqueues a moderation job **stub** that no-ops until M7 (do not skip the enqueue).

Audio: Supabase Storage + AAC job can wait until a later task in this milestone if video and images work; do not ship publish without at least image + video.

**Acceptance.** Upload a photo and a short video from device. Both reach `ready`. Playback URL and poster exist. A second use of the same signed URL fails. Webhook signature is verified.

### 2.6 Offline upload queue

MMKV queue of upload intents with tus fingerprints. Survives app kill. Resumes on connectivity. Per-item progress and failure in the studio.

**Acceptance.** Start a showreel upload, force-quit mid-transfer, reopen on a connection: upload resumes without re-selecting the file.

### 2.7 Publish and completeness scores

`talent.publish` / `unpublish`. Status `draft | live | suspended`. Completeness score written on section write. Quality score job runs on publish (follower count and sensitive attributes excluded).

**Acceptance.** Publish makes `status = 'live'` and `published_at` set. Unpublish reverts to draft. Completeness does not include complexion/ethnicity/gender/body measurements.

### 2.8 `talent_search` projection

Denormalised table per TECH_SPEC §5.10. Triggers on source tables for correctness-critical fields (status, city, categories, skills, languages, rates, visibility). pg-boss job for `quality_score`, `freshness_score`, `completeness_score`. Indexes: GIN on arrays, `attrs`, `search_tsv`; btree `(status, country, city_id)`; partial index `status = 'live'`.

**Acceptance.** Publishing Tunde writes/updates exactly one `talent_search` row. Adding Yoruba updates that row without a full refresh. `EXPLAIN` of `SELECT … WHERE status = 'live' AND city_id = $1` uses the partial/compound index.

### 2.9 `serializeTalent` stub

Single function in `packages/core`. For M2, hide rates when `rate_visibility = 'hidden'` from non-owners. Viewer context (verified booker, active role) wired fully in M8; the function signature must already take `viewer` and `context` so callers never build payloads by hand.

**Acceptance.** No tRPC procedure returns a talent object except via `serializeTalent`. Hidden rates are absent (not `null`) for a non-owner viewer.

### 2.10 Device measurement gate (M2)

On a 2GB Android over throttled 3G, open live preview of a 12-section portfolio including one HLS video.

Record: time to first preview frame, scroll fps in the preview list, payload size of the preview fetch.

**Acceptance.** Numbers are written into this plan's notes or a `docs/plans/measurements.md` log. No budget pass/fail yet — M5 decides. If preview cannot scroll at all, stop and fix renderers before M3/M5.

---

## Exit gate

A talent on device completes quick-start, uploads media over a killed-app interruption, publishes, and the `talent_search` row is correct. Completeness ignores sensitive fields. Measurement log from 2.10 exists.

## Deferred

- Public web page (M3)
- Data-saver toggle in the deck (M5) — studio may still upload full quality
- Moderation actually quarantining (M7) — job is queued only
- Full `serializeTalent` sensitive-attribute stripping (M8)
- Audio/press/testimonials/custom rich studio (types may exist)
- Theme system beyond the three templates
- Analytics / who-viewed (M10)

## Risks

| Risk | Decision if it materialises |
|------|------------------------------|
| Cloudflare Stream tus from Expo is painful | Keep Stream for playback; use a documented fallback upload path, do not change CDN |
| 12-section preview janks badly in 2.10 | Fix estimators/virtualisation before starting M5; do not ignore the log |
