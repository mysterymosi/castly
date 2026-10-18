# Castly — Technical Specification

**Version:** 0.1 (draft for review)
**Date:** 18 September 2026
**Companion to:** `PRD.md` v0.2
**Status:** Awaiting sign-off before build

Section references in the form §7.2.1 point at the PRD unless prefixed with "spec".

---

## 1. Scope and approach

This specifies the full v1 MVP as described in PRD §10 Phase 1. Phase 2 and 3 features are out of scope for implementation but are called out where they constrain a v1 design decision — schema choices in particular, because those are expensive to reverse.

Three properties drive nearly every decision below:

1. **The audience is bandwidth- and device-constrained.** Entry-level Android, 3G, metered data. This is not a "nice to optimise later" concern; it determines the media pipeline, the deck prefetch strategy, and the offline model.
2. **The build team is one person.** Every decision favours managed services and a single language over operational surface and marginal elegance. Where there is a buy-versus-build choice, this spec buys.
3. **Authorisation is unusually complex.** Conditional sensitive attributes, three-state rate visibility, delegated agency access, match-gated messaging. That complexity must live in one testable place, not be scattered across database policies.

### 1.1 Delivery reality

The full Phase 1 scope is a large solo build. §24 gives a milestone sequence with a suggested cut line for a first release that still proves the core loop. The spec covers the full scope as requested; the sequencing is where scope gets managed.

---

## 2. Architecture

### 2.1 Components

```
+-----------------+   +------------------+   +--------------------+
|  Mobile (Expo)  |   |  Web (Next.js)   |   |  Admin (Next.js)   |
|  iOS + Android  |   | public portfolios|   |   ops console      |
+--------+--------+   +--------+---------+   +---------+----------+
         |                     |                       |
         |  tRPC (HTTP)        |  tRPC + RSC           |  tRPC
         +----------+----------+-----------+-----------+
                    |                      |
         +----------v----------------------v-----------+
         |          API service  (Node + tRPC)         |
         |  auth guard . deck engine . search . rules  |
         |  media orchestration . webhooks . jobs      |
         +--+-----------+----------+---------+---------+
            |           |          |         |
   +--------v---+ +-----v-----+ +--v-------+ +v--------------+
   |  Postgres  | | Supabase  | |Cloudflare| | Third parties |
   | (Supabase) | |Auth/RT/Stg| |Stream/Img| |Termii SmileID |
   | + pg-boss  | |           | |          | |Paystack Hive  |
   +------------+ +-----------+ +----------+ +---------------+
```

### 2.2 The boundary rule

**One door for logic.** All reads and writes go through the API service, with exactly two deliberate exceptions:

| Exception | Why | Control |
|-----------|-----|---------|
| Realtime chat subscriptions | Supabase Realtime reads Postgres replication directly; proxying it would mean building websocket infrastructure | Narrow RLS on `messages` and `conversation_participants` only |
| Direct-to-storage media uploads | Resumable multi-megabyte uploads should not transit the API | API issues short-lived, single-use signed upload URLs; provider webhooks confirm completion |

Everything else — including all portfolio reads, deck requests, and search — is a tRPC call. Resisting "just this one query direct from the client" is the single most important discipline in this codebase. The moment authorisation logic exists in two places, the sensitive-attribute guarantees in §7.3.1 become unverifiable.

### 2.3 Row-level security posture

RLS is **enabled with default-deny on every table** as defence in depth, not as the authorisation layer. The API connects as a role that bypasses RLS; the anon and authenticated roles are granted only what the two exceptions above require. This gives a hard backstop if a Supabase key ever leaks, without making SQL policies carry business rules.

---

## 3. Technology decisions

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Language | TypeScript (Node 22 LTS) | The client is React Native, so a TS server gives end-to-end types with no codegen. The portfolio section schema must validate identically on mobile, web, and server — one Zod schema does that. Solo builds are dominated by context-switching cost. |
| Mobile | **Expo SDK 57**, expo-router, RN 0.86 | Current stable (released 30 June 2026). EAS Update ships JS fixes without store review — a meaningful safety net for one person. Pin with `npx expo install expo@^57.0.0`. |
| Animation / gesture | Reanimated 4.5 + Gesture Handler 2.32 | The versions bundled with SDK 57. Required for the direction-lock arbitration in §7.2.1. Runs on the UI thread, which is what keeps swipes at 60fps on weak hardware. |
| Lists | FlashList v2 | Section virtualisation inside cards, and the deck itself. |
| Styling | NativeWind 4 (mobile), Tailwind + shadcn (web/admin) | Matches existing projects. Shared design tokens package. |
| Web | Next.js (App Router) | Public portfolios need SSR for SEO and OG tags — this is the growth loop in §7.1.2, not a nice-to-have. |
| API | tRPC v11 | Zero-codegen end-to-end types across three clients. Hono handles raw webhook endpoints. |
| ORM | **Drizzle** | The deck query needs composable hand-written SQL. Prisma would force `$queryRaw` precisely where the logic is most complex and most dangerous. Drizzle stays typed through real SQL. |
| Database | Postgres 16 (Supabase) | Relational data with heavy structured filtering. GIN indexes for attributes, full-text for search, pgvector already present for Phase 2. |
| Jobs | **pg-boss** | Postgres-backed. Zero additional infrastructure. Revisit BullMQ/Redis only when measured throughput demands it. |
| Auth | Supabase Auth + Termii hook | Phone OTP, WhatsApp-first. Never build auth. |
| Realtime | Supabase Realtime | Chat transport and presence. |
| Video | Mux | HLS playback, direct upload, webhooks for ready state. |
| Images | Cloudflare Images | Named variants at the CDN edge. |
| Payments | Paystack | NGN, cards, bank transfer, USSD. See §19 on store billing. |
| KYC | Smile ID | Most mature React Native SDK among Nigerian providers. |
| Moderation | Hive or Sightengine + PhotoDNA | Nudity scanning by API; CSAM handled separately as a legal obligation (§18.3). |
| Monorepo | Turborepo + pnpm | Matches existing projects. |
| Hosting | Railway (API, London) · Vercel (web, admin) · Supabase (London) | No provider has West Africa. Lagos↔London is ~90–120ms over Equiano/2Africa, which is acceptable; media latency is solved at the CDN edge, which is where the bytes are. |

### 3.1 Rejected alternatives

| Considered | Why not |
|-----------|---------|
| Supabase-only (RLS + edge functions) | The deck engine needs global fairness state and deterministic cursors; the permission model needs conditional field-level visibility. Both become untestable SQL. RLS bugs are data-exposure bugs. |
| Go | Best runtime economics and sqlc is attractive for deck queries, but the bottleneck is media delivery, not compute. Verbosity and a second language cost more than they return here. |
| Elixir / Phoenix | The best realtime story available, and LiveView would nearly hand over the ops console. But chat is table stakes, not the value proposition, and Nigerian payment/KYC SDKs would all be hand-rolled. |
| Python / FastAPI | Becomes correct when ranking turns ML-driven. At v1 ranking is weighted heuristics, and pgvector serves Phase 2 from any language. Reconsider as a sidecar in Phase 3. |
| Rails | Fastest CRUD velocity and near-free admin, but dynamic typing against this permission model is a liability exactly where mistakes are most costly. |
| Bun | Ecosystem edge cases cost debugging time a solo developer cannot spare. |
| Elasticsearch / Typesense | Unnecessary at v1 scale. Postgres with proper indexing handles this comfortably into six figures of talent. |
| React Native Web (shared renderer) | The public page must be SEO-grade and fast; the card is a constrained container. Different jobs. Share the schema, not the renderer. |

---

## 4. Repository structure

```
castly/
  apps/
    mobile/            Expo, expo-router - the deck, studio, chat
    web/               Next.js - public portfolios, open roles, marketing
    admin/             Next.js - ops console
    api/               Node - tRPC routers, services, jobs, webhooks
  packages/
    schema/            Zod: portfolio sections, attributes, API contracts
    db/                Drizzle schema, migrations, seed
    core/              Pure domain logic: ranking, scoring, fairness, eligibility
    ui-tokens/         Design tokens shared by NativeWind and Tailwind
    portfolio-native/  RN section renderers
    portfolio-web/     React section renderers
    config/            eslint, tsconfig, prettier
  docs/                PRD.md, TECH_SPEC.md, plans/
```

`packages/core` holds ranking and eligibility as **pure functions with no I/O**. This is deliberate: the deck algorithm is the hardest thing in the product to get right and the easiest to break silently. Pure functions let it be tested exhaustively with golden files and property tests (§22.2) without a database.

---

## 5. Data model

Drizzle schema in `packages/db`. Conventions: `uuid` v7 primary keys (time-ordered, index-friendly), `timestamptz` everywhere, soft delete via `deleted_at` only where recovery matters, `snake_case` columns.

### 5.1 Identity

```
users                    id, phone, email, status, created_at, last_active_at
                         ^ mirrors supabase auth.users.id
user_modes               user_id, mode(talent|booker|admin), enabled_at
                         ^ role is a mode, not an identity (§4.1)
device_tokens            user_id, platform, token, last_seen_at
```

### 5.2 Taxonomy and attributes

Ops-editable per §7.9, so taxonomy is data rather than code.

```
categories               id, parent_id, slug, name, kind(on_camera|crew|production|events),
                         active, sort
attribute_definitions    id, key, label, data_type, tier(standard|sensitive|prohibited),
                         applies_to_category_ids[], options jsonb, active
skills / languages / accents / cities    reference tables
```

`attribute_definitions.tier` is the single source of truth for §7.3.1 enforcement. The `prohibited` tier exists in the enum so the constraint is explicit and testable, but **no prohibited attribute may ever have a row** — enforced by a CHECK constraint and a CI guard (§21.3).

### 5.3 Talent

```
talent_profiles          user_id(pk), slug, display_name, headline, bio,
                         city_id, willing_to_travel, open_to_relocate,
                         status(draft|live|suspended), published_at,
                         completeness_score, quality_score, responsiveness_score,
                         rate_visibility(public|verified_bookers|hidden)
talent_categories        talent_id, category_id, is_primary, sort
talent_attributes        talent_id, definition_id, value_text, value_num, value_bool,
                         is_visible
talent_skills            talent_id, skill_id, proficiency
talent_languages         talent_id, language_id, fluency
talent_accents           talent_id, accent_id
credits                  talent_id, title, role_name, production_company, year,
                         type, link, is_signature, verified_at
talent_rates             talent_id, kind(day|half_day|project), amount_min, amount_max,
                         currency, negotiable
talent_availability      talent_id, month, status(available|partial|booked)
training / affiliations / press / testimonials / social_links
```

`rate_visibility` sits on the profile rather than on each rate row, because §7.1.1 describes one toggle governing the block.

### 5.4 Portfolio composition

```
portfolio_sections       id, talent_id, type, position, is_visible,
                         schema_version, config jsonb
section_media            section_id, media_id, position, caption
media_assets             id, owner_id, kind(image|video|audio|document),
                         provider(cf_images|mux|supabase),
                         provider_ref, status(pending|processing|ready|failed|quarantined),
                         width, height, duration_ms, poster_url, blurhash,
                         moderation_status, moderation_payload jsonb
```

A CHECK constraint enforces the 12-section cap from §7.2.1 via a trigger counting visible sections per talent.

`config` is validated against the Zod schema for `(type, schema_version)` at the API boundary on every write. Never trusted on read.

### 5.5 Booker, projects, roles

```
booker_profiles          user_id(pk), vertical, company_name, cac_number,
                         city_id, typical_project_types[], verification_tier
projects                 id, booker_id, name, type, status, created_at
roles                    id, project_id, name, brief, category_id,
                         requirements jsonb, shoot_window, rate_min, rate_max,
                         is_published, published_at
                         ^ is_published drives the open-roles board (§7.4)
shortlists               id, booker_id, role_id nullable, name
shortlist_entries        shortlist_id, talent_id, note, rank, added_at
saved_filters            id, booker_id, name, filter jsonb
```

`roles.requirements` holds the structured brief used as soft ranking weights. It is jsonb rather than columns because role requirements span every category's attribute set, and the taxonomy is ops-editable.

### 5.6 Deck, swipes, exposure

```
deck_sessions            id, booker_id, role_id nullable, started_at, ended_at,
                         goal_count, seed
deck_queue               session_id, position, talent_id, score, reasons jsonb,
                         served_at
                         ^ materialised per session for deterministic paging
swipes                   id, booker_id, talent_id, role_id nullable,
                         direction(pass|interest|save), source(deck|open_role|search),
                         created_at, undone_at
deck_impressions         session_id, talent_id, position, shown_at,
                         max_scroll_depth, dwell_ms
talent_exposure_daily    talent_id, day, impressions, interests
                         ^ rolled up nightly; backs the fairness cap
profile_views            talent_id, viewer_id, at
```

`deck_queue` materialising the session is what makes paging deterministic. Without it, a booker scrolling a deck while the underlying scores shift would see repeats and gaps.

### 5.7 Interests, matches, messaging

```
interests                id, booker_id, talent_id, role_id nullable,
                         status(pending|accepted|declined|expired),
                         created_at, responded_at, expires_at
matches                  id, interest_id, booker_id, talent_id, role_id, created_at
conversations            id, match_id
conversation_participants conversation_id, user_id, last_read_at
messages                 id, conversation_id, sender_id, kind, body,
                         media_id, created_at, deleted_at
raised_hands             talent_id, role_id, created_at
                         ^ unique(talent_id, role_id); weekly cap enforced in service
```

`conversation_participants` exists specifically so the RLS policy on `messages` can be a simple, auditable membership check — the one place RLS carries real weight.

### 5.8 Trust and safety

```
verifications            id, user_id, tier(phone|id|professional), provider,
                         provider_ref, status, evidence jsonb,
                         reviewed_by, reviewed_at, expires_at
reports                  id, reporter_id, subject_type, subject_id, reason,
                         detail, status, resolution, handled_by, created_at
moderation_events        id, subject_type, subject_id, source(auto|human),
                         verdict, payload jsonb, created_at
conduct_reports          id, match_id, reporter_id, subject_id, kind, detail
                         ^ private reliability signal (§7.6)
blocks                   blocker_id, blocked_id, created_at
sensitive_filter_audit   id, booker_id, role_id, attributes jsonb,
                         result_count, created_at
```

`verifications.evidence` stores **provider references and outcomes only — never raw identity documents or selfies.** Those stay with Smile ID. This materially reduces breach exposure and NDPA obligations (§20.4).

### 5.9 Monetization and configuration

```
subscriptions            id, user_id, plan, status, provider(paystack|apple|google),
                         provider_ref, current_period_end, cancel_at
boosts                   id, talent_id, starts_at, ends_at, multiplier, source
ranking_weights          key, value numeric, updated_by, updated_at
vertical_category_weights booker_vertical, category_id, weight
                         ^ the cold-start mapping table (§7.2.3 item 1, §7.9)
feature_flags            key, value jsonb, description
notification_prefs       user_id, channel, category, enabled, frequency_cap
```

`ranking_weights` and `vertical_category_weights` being tables rather than constants is a hard requirement from §7.9 — ops must retune the deck without a deploy.

### 5.10 The search projection

```
talent_search            talent_id(pk), status, city_id, region, country,
                         category_ids int[], skill_ids int[], language_ids int[],
                         accent_ids int[],
                         age_min, age_max, height_cm, gender, complexion,
                         rate_day_min, rate_day_max, rate_visibility,
                         has_showreel, credit_count, verification_tier,
                         quality_score, freshness_score, responsiveness_score,
                         attrs jsonb,
                         search_tsv tsvector,
                         updated_at
```

A denormalised projection table, not a materialised view — incremental row updates are required, and a full matview refresh would be unusable. Maintained by triggers on the source tables for correctness-critical fields, and by a pg-boss job for the derived scores.

Indexes: GIN on each array column and on `attrs`, GIN on `search_tsv`, btree on `(status, country, city_id)`, and a partial index on `status = 'live'` since every deck query filters on it.

---

## 6. API surface

tRPC routers in `apps/api/src/routers`. Every procedure declares its auth requirement through middleware: `public`, `authed`, `talent`, `booker`, `verifiedBooker`, `admin`.

```
auth        requestOtp · verifyOtp · refresh · me · enableMode
talent      getProfile · updateProfile · publish · unpublish
            sections.list|create|update|reorder|delete
            attributes.set · credits.* · rates.* · availability.*
            completeness · analytics
media       createUploadUrl · confirmUpload · delete · status
booker      getProfile · updateProfile · submitVerification
project     list · create · update · archive
role        create · update · publish · unpublish · listOpen
deck        start · next · swipe · undo · exhaustionState
            ^ deck.next is the hot path; see §7
search      count · query · savedFilters.*
interest    listIncoming · accept · decline · setAutoAccept
match       list · get
message     list · send · markRead
openRole    browse · raiseHand · whosHiring
shortlist   list · get · addNote · reorder · compare · shareLink
subscription  getPlans · createCheckout · status · cancel
admin       verificationQueue · moderationQueue · reports · taxonomy
            rankingWeights · verticalWeights · sensitiveAudit · marketplaceHealth
```

### 6.1 Field-level visibility

Rate visibility and sensitive attributes mean **the same talent serialises differently for different viewers.** This is handled by a single `serializeTalent(talent, viewer, context)` function in `packages/core`, used by every procedure that returns talent data. No procedure builds a talent payload by hand.

The function takes viewer verification tier and active-role context, and returns a DTO with disallowed fields absent — not null, absent — so a client bug cannot leak a hidden value.

---

## 7. The deck engine

The most complex component, and the one with the most ways to be subtly wrong. Implemented as four stages, with stages 2 and 3 as pure functions in `packages/core`.

### 7.1 Stage 1 — Candidate generation

A single SQL query against `talent_search`, returning roughly 500 candidates.

**Hard filters** (exclusion):
- `status = 'live'`
- Category ∈ the target set — from `vertical_category_weights` for the booker's vertical, or from `roles.category_id` when a role is active
- Country/region scope
- Not previously swiped for this role within the decay window (§7.2.2: 30 days)
- Not blocked in either direction
- Any standard-tier filters the booker has applied
- Sensitive-tier filters **only if a role with a non-empty brief is active** (§7.3.1)

**Pre-ordering**: `quality_score DESC` with a session-seeded random tiebreak, so two bookers in the same vertical do not receive identical decks.

Candidate generation must stay under ~120ms p95. It is the only database round trip in the hot path.

### 7.2 Stage 2 — Scoring

Pure function. Weights loaded from `ranking_weights`, cached 60 seconds.

```
score =  w_vertical       × verticalCategoryMatch      // §7.2.3 (1)
       + w_geo            × geoProximity                // (2) city → country → region
       + w_quality        × qualityScore                // (3)
       + w_freshness      × freshnessScore              // (4)
       + w_responsiveness × responsivenessScore         // (6)
       + w_role           × roleSoftMatch               // soft weights when role active
       + w_raised_hand    × raisedHandFlag              // §7.4
       + boostContribution                              // capped, labelled
```

Each component appends to a `reasons[]` array as it contributes, which becomes the "why you're seeing this" string in §7.2.3. Explainability is a by-product of scoring rather than a separate code path, so it cannot drift from reality.

**`roleSoftMatch` never excludes.** A talent outside the stated age range loses points; they do not vanish. This is an explicit PRD requirement and is covered by a property test.

**Excluded by construction:** follower count is not an input. Sensitive attributes contribute only through `roleSoftMatch` when a role is active, never to general ranking.

**Boost is bounded.** `boostContribution` is capped at a configured fraction of the maximum achievable organic score, and any boosted card is flagged for labelling in the UI. The cap exists because paid placement that degrades deck quality destroys the product (§7.8).

### 7.3 Stage 3 — Fairness and diversification

Applied after scoring, before the queue is written. This stage is what keeps the supply side alive (§7.2.3 item 5, metric "≥40% of talents receive ≥1 interest per month").

1. **Exposure penalty.** Talents whose 7-day impressions exceed a configured percentile are demoted proportionally. A penalty rather than a hard cap, so sparse decks are never starved.
2. **Exploration injection.** A reserved fraction of slots — default 20%, configurable — goes to talents in the lowest lifetime-impression decile who cleared the hard filters. Epsilon-greedy, deliberately simple.
3. **Diversity spacing.** No more than N consecutive cards sharing a category, city, or managing agency.

All three are configurable through `ranking_weights` and all three have property tests asserting their invariants hold for arbitrary inputs.

### 7.4 Stage 4 — Queue materialisation

The ordered result writes to `deck_queue` keyed by `session_id`. `deck.next` reads forward from a cursor. Impressions are recorded on serve.

Refill triggers when fewer than 10 unserved rows remain, re-running stages 1–3 with the already-served set excluded. When candidate generation returns nothing, the client receives an exhaustion payload with suggested filter relaxations ranked by how many results each would unlock (§7.2.2).

### 7.5 Derived scores

Computed by pg-boss jobs, written to `talent_search`. Never computed in the hot path.

| Score | Inputs | Refresh |
|-------|--------|---------|
| `quality_score` | Section completeness, media count and resolution, showreel presence, credit depth, verification tier. **Excludes follower count and all sensitive attributes.** | On publish, and nightly |
| `freshness_score` | Last active, last portfolio update. Decaying. | Nightly |
| `responsiveness_score` | Interest acceptance rate, median first-reply time, conduct reports | Nightly |
| `completeness_score` | Section coverage weighted by category. Sensitive fields excluded by definition (§7.3.1) | On write |

---

## 8. Search and filtering

Single query builder over `talent_search`, shared by deck candidate generation and explicit search so filter semantics cannot diverge.

**Rate filtering** implements the §7.3 privacy rule directly: talents with `rate_visibility = 'hidden'` are returned in a separate `onRequest` result group rather than excluded, so hiding a rate never costs visibility.

**Live result counts** need to be fast and are allowed to be approximate. Exact `count(*)` when the estimate is under 5,000; above that, the planner's row estimate via `EXPLAIN (FORMAT JSON)`, rendered as "1,000+". A 200ms statement timeout guards the interactive path.

**Sensitive filters** pass through a guard in `packages/core` that checks for an active role with a non-empty brief, then writes a `sensitive_filter_audit` row **in the same transaction as the query**. Same transaction is the point: an audit trail that can fail independently of the thing it audits is not an audit trail.

**Free-text** uses `search_tsv` with `websearch_to_tsquery`. Phase 2 natural-language search adds pgvector embeddings plus LLM extraction of structured filters, which is why the projection table already carries typed columns.

---

## 9. Portfolio system

### 9.1 Section schema

A Zod discriminated union on `type`, in `packages/schema`, versioned per section type.

```ts
const HeroSection = z.object({
  type: z.literal("hero"),
  schemaVersion: z.literal(1),
  style: z.enum(["full_bleed", "video_loop", "split", "minimal"]),
  mediaId: z.string().uuid().nullable(),
  headline: z.string().max(120).optional(),
  showBadges: z.boolean().default(true),
});
// … about, gallery, showreel, audio, credits, attributes, skills,
//    languages, rates, availability, training, affiliations, press,
//    testimonials, social, custom
```

Section **types** are many; section **instances** are capped at 12 per §7.2.1.

**Schema evolution.** Each section row stores its `schema_version`. Readers run registered forward-migrators to the current version in memory; a background job rewrites rows opportunistically. Never migrate portfolio content in a blocking deploy — published portfolios are user-owned artefacts and a bad migration is visible damage.

### 9.2 Two renderers

`packages/portfolio-native` and `packages/portfolio-web` consume the same validated section list.

- **Native** renders it as a virtualised vertical list inside the deck card (§7.2.1).
- **Web** renders it as a stacked, server-rendered page with OG tags.

Parity is enforced by a snapshot suite that runs the same fixture portfolios through both and compares extracted semantic content — not pixels. Divergence in *content* is a bug; divergence in *presentation* is intended.

### 9.3 Card-width constraint

Every native section must render correctly at card width with a fixed height estimate available before layout, because FlashList needs estimates to virtualise without measurement thrash. Each section type exports `estimateHeight(config, mediaMeta)`. A section type without a height estimator cannot ship.

---

## 10. The deck card

### 10.1 Gesture arbitration

Direction lock, per §7.2.1:

- The card's horizontal pan uses `activeOffsetX: [-15, 15]` with `failOffsetY: [-10, 10]`. Vertical movement past the threshold first permanently fails the swipe for that gesture.
- The inner scroll and the outer pan are coordinated with `simultaneousWithExternalGesture` so neither can steal mid-gesture.
- While the scroll carries momentum, swipe recognition is suppressed until it settles.
- All of it runs on the UI thread via Reanimated worklets. No JS-thread involvement in gesture response.

### 10.2 Render and prefetch budget

- **Only the focused card mounts its section list.** Cards at position n+1 and n+2 render the decision layer from a poster image and a blurhash placeholder.
- The focused card's depth layer mounts lazily on first scroll intent.
- **One video element active at a time**, in the focused card, and only while its section is ≥50% visible.
- Deck prefetch fetches decision-layer payloads for the next 5 cards — target under 150KB each — and full section data only for n+1.

### 10.3 Data-saver

A client-side mode that switches HLS to the lowest rendition and replaces autoplay with poster plus tap-to-play. Offered proactively when `expo-network` reports a metered or cellular-slow connection, and reachable in one tap from the deck. Never buried in settings (§7.1.3).

---

## 11. Media pipeline

### 11.1 Upload

1. Client compresses locally — `expo-image-manipulator` for images; video is uploaded as captured and transcoded server-side.
2. Client requests a single-use upload URL from `media.createUploadUrl`. A `media_assets` row is created with `status = 'pending'`.
3. Client uploads directly to Cloudflare via **tus**, which is resumable across app restarts and network loss.
4. Provider webhook moves the row to `processing`, then `ready` with dimensions, duration, poster, and playback IDs.
5. Reaching `ready` enqueues a moderation job (§18).

### 11.2 Offline upload queue

A persistent client queue in MMKV holding upload intents with their tus fingerprints. Survives app termination, resumes on connectivity, and surfaces per-item progress and failure states in the studio. A talent on a Lagos commute must be able to start a showreel upload in a dead zone and have it finish later without re-selecting the file.

### 11.3 Delivery

- **Images** — Cloudflare Images named variants: `card` (card width), `thumb`, `full`, `og`. Blurhash stored on the asset row for instant placeholders.
- **Video** — Mux HLS playback and poster thumbnails. Data-saver pins the lowest rendition.
- **Audio** — Supabase Storage behind the CDN; normalised to AAC by a job.

---

## 12. Authentication

- **Supabase Auth**, phone OTP primary. A custom SMS hook routes to **Termii**, attempting **WhatsApp OTP first with SMS fallback** — cheaper and more reliably delivered in Nigeria than SMS alone.
- Email, Google, and Apple are optional secondary methods (Apple is mandatory for App Store review if any other social login ships).
- Tokens in `expo-secure-store`. The API validates JWTs against Supabase JWKS with `jose`.
- **Modes, not roles.** One account may hold both talent and booker modes (§4.1). The active mode is a client concern; the server authorises per resource and never trusts a client-asserted mode.
- **Agency delegation** (§11.2): a `profile_delegates` grant lets an agency act on a talent profile. The talent is always the owner and can revoke unilaterally. There is no path by which an agency becomes the owner — enforced at the schema level, because this is the rule that stops Castly rebuilding the gatekeeping it exists to route around.

---

## 13. Messaging

- **Writes go through tRPC** so validation, the anti-fraud interstitial (§7.5), moderation hooks, and notification fanout all run server-side.
- **Reads subscribe via Supabase Realtime** on `messages`, gated by RLS membership in `conversation_participants`.
- Typing indicators and presence use ephemeral Realtime broadcast channels; they are never persisted.
- Media messages reuse the §11 pipeline.
- Quick replies (§7.5) are client-side templates — no server support needed.
- **Chat is gated on an accepted interest.** No conversation row can exist without a match, enforced by foreign key.

---

## 14. Notifications

- Expo Push → FCM/APNs. Fanout by pg-boss.
- **SMS fallback via Termii** for high-value events — new interest, new match — when a push has gone unacknowledged for a configured interval. Push delivery on low-end Android is genuinely unreliable, so this is a functional requirement, not a courtesy.
- Per-category preferences and frequency caps in `notification_prefs`; a weekly digest as the low-intensity default.
- Every notification write is idempotent on `(user_id, category, subject_id)` to survive job retries.

---

## 15. Open roles

- `role.publish` flips `is_published`, making the role visible on the board. Default off (§7.4).
- `openRole.browse` filters to the talent's categories and location by default.
- `openRole.raiseHand` enforces the weekly cap (default 5) in a transaction, writes `raised_hands`, and thereby sets the `raisedHandFlag` input to §7.2 scoring.
- **A guard in the subscription service forbids any plan from granting extra or boosted raises** (§7.4, §3.3). Encoded as a test, not just a policy.
- `whosHiring` returns recently active bookers by vertical with no contact affordance.

---

## 16. Verification

| Tier | Mechanism | Cost to user | Required |
|------|-----------|--------------|----------|
| Phone | Termii OTP | Free | At signup |
| Professional (booker) | CAC lookup, work email domain, or manual portfolio review | Free | **Before first interest** |
| ID (talent) | Smile ID document + liveness | Free | Optional |

- The **booker gate is enforced in middleware** (`verifiedBooker`), not in the UI. An unverified booker may browse the deck but cannot swipe right, message, or publish a role.
- Manual professional review runs through the admin queue and sits on the booker activation path, so it is prioritised in the ops console (§7.9).
- Only provider references and outcomes are stored (§5.8).
- Name-mismatch retries are expected to be common on Nigerian IDs; the flow allows up to 3 attempts with clear guidance before routing to manual review.

---

## 17. Payments and subscriptions

- **Paystack** for NGN via card, bank transfer, and USSD. Recurring billing through authorisation codes.
- Webhooks verified by signature, processed idempotently on the Paystack reference, and reconciled by a nightly job against Paystack's API — webhook delivery is not guaranteed, and silently lapsed or silently active subscriptions are both bad.
- Entitlements resolve through one function in `packages/core` so no feature checks a plan name directly.
- **Store billing is unresolved.** Castly Pro sells in-app visibility features, which Apple and Google generally require be sold through their own systems at 15–30%. This materially affects NGN pricing and possibly the monetization model itself. Deferred by decision (PRD §13), but it must be settled before Pro ships, not after. Schema supports `provider ∈ (paystack|apple|google)` so the model is not the blocker.

---

## 18. Trust, safety, moderation

### 18.1 Automated screening

Every `media_assets` row reaching `ready` enqueues a scan (Hive or Sightengine). Nudity or violence above threshold sets `status = 'quarantined'` and creates a moderation event. Quarantined media never appears in a deck.

### 18.2 Reporting

In-app reporting from every surface with the §7.6 reason taxonomy, feeding an ops queue with an SLA timer. Fee-request and sexual-solicitation reports are auto-escalated to the top of the queue.

### 18.3 CSAM — a legal obligation, not a feature

This cannot be deferred to "when we have volume." Any service hosting user-uploaded images of people needs a hash-matching path (PhotoDNA or Thorn Safer), a defined escalation and preservation procedure, and a reporting relationship with NCMEC and the Nigerian authorities. **This must be in place before the first public upload.** Treat it as a launch blocker and budget legal review for it.

### 18.4 Minors

No under-18 accounts in v1 (§7.6). Date of birth is collected at signup and enforced. Guardian-managed accounts are Phase 2 with legal review.

---

## 19. Admin console

Next.js app, admin-only tRPC procedures. Not optional — the curation and trust systems need operators from day one, and the operator is you.

- Verification queue, booker-professional prioritised
- Moderation and report queues with action logging
- Taxonomy management, including attribute tier assignment
- **Sensitive-filter audit log** with per-booker outlier flagging (§7.3.1)
- Ranking weights and the vertical→category mapping, editable live
- Deck inspector: run a deck as a given booker and see every score component and reason per card. This is the difference between tuning the deck and guessing at it.
- Open-roles moderation
- Marketplace health: portfolio-complete counts per category per city against the 300/500 gates (§11.1), exhaustion rates, match and reply rates

---

## 20. Security and privacy

### 20.1 Sensitive attributes

Enforcement lives in exactly one guard in `packages/core`, called by the query builder. It checks tier, requires an active role with a non-empty brief for sensitive-tier access, and writes the audit row in the same transaction.

### 20.2 Prohibited attributes

No column, no definition row, no free-text prompt inviting them. A CI check fails the build if banned keys appear in schema files or migrations. The cheapest way to never misuse data is to never hold it.

### 20.3 Standard posture

Default-deny RLS as backstop; least-privilege API database role; secrets in the platform secret store and never in the repo; rate limiting per user and per IP on OTP, search, and messaging; signed, short-lived, single-use media URLs.

### 20.4 NDPA compliance

Nigeria's Data Protection Act 2023 applies. Required: a lawful basis per processing purpose, data subject access and deletion, a retention schedule, breach notification procedure, and a designated contact. Account deletion must cascade correctly through media, messages, and search projections — build and test it as a first-class path, because it is both a legal requirement and a genuinely hard cascade.

---

## 21. Observability

- **Sentry** for errors and performance across mobile, web, and API, with release tracking tied to EAS builds.
- **PostHog** for product analytics. The PRD's metric set (§9) maps directly to a tracked event schema defined in `packages/schema` so event names cannot drift.
- Structured JSON logs with a request ID propagated from client through API to job.
- Deliberate business alerts, not just error alerts: deck exhaustion rate rising, moderation queue exceeding SLA, verification queue backing up, exposure concentration worsening. The marketplace can be unhealthy while every server is green.

---

## 22. Testing

### 22.1 Layers

| Layer | Tool | Target |
|-------|------|--------|
| Unit — pure domain | Vitest | `packages/core` at high coverage; this is where correctness matters most |
| Integration — API | Vitest + testcontainers Postgres | Every procedure, including authorisation paths |
| Contract | Zod fixtures | Portfolio schema round-trip and forward migration |
| Renderer parity | Snapshot | Native vs web semantic content |
| E2E mobile | Maestro | Signup, portfolio publish, deck session, match, chat |
| E2E web | Playwright | Public portfolio, OG tags, open roles |

### 22.2 Ranking-specific testing

The deck engine gets treatment beyond normal unit tests:

- **Golden decks** — fixture populations with committed expected orderings, so weight changes surface as reviewable diffs.
- **Property tests** (fast-check) asserting invariants for arbitrary inputs: no sensitive attribute ever affects score without an active role; `roleSoftMatch` never excludes; the exploration fraction is always met when eligible candidates exist; no talent exceeds the exposure ceiling; boost never exceeds its cap.
- **Fairness simulation** — a scripted run over synthetic populations reporting the Gini coefficient of impressions and the share of talents receiving at least one interest, asserted against the §9 target of 40%.

### 22.3 Device testing

At least one physical entry-level Android device — a Tecno or Infinix in the 2GB RAM class — is required equipment, not a nice-to-have. Deck scroll and swipe performance must be validated there before the block library is locked. Simulators will not reveal these problems.

---

## 23. Environments and delivery

- **Environments**: local (Supabase CLI + Docker), preview (per-PR Vercel plus a Supabase branch), production.
- **CI** (GitHub Actions): typecheck, lint, unit, integration against ephemeral Postgres, the prohibited-attribute guard, and Drizzle migration checks.
- **Mobile releases**: EAS Build for store submissions; EAS Update for JS-only fixes, which avoids review latency for the inevitable early bugfixes.
- **Migrations**: Drizzle Kit, forward-only, reviewed. Expand-and-contract for anything touching live portfolio data.
- **Feature flags** in the database for staged rollout of deck changes in particular.

---

## 24. Build sequence

Ordered so the riskiest unknowns are resolved early and each milestone produces something demonstrable.

Ticket-level plans for each row live in `docs/plans/`.

| # | Milestone | Contents |
|---|-----------|----------|
| 1 | Foundations | Monorepo, Drizzle schema, auth with Termii OTP, CI, Sentry |
| 2 | Talent core | Portfolio studio with the core section set, media pipeline end to end, completeness meter, publish |
| 3 | Public portfolios | Next.js SSR pages, OG tags, vanity URLs — the organic growth loop |
| 4 | Booker core | Signup, vertical profiling, projects and roles |
| 5 | **Deck v1** | Candidate generation, scoring, fairness, queue, swipe, shortlists |
| 6 | Match loop | Interests, accept/decline, matches, chat, notifications |
| 7 | Trust | Verification tiers, booker gate, reporting, moderation, admin queues |
| 8 | Filters | Full filter set, sensitive-tier guard and audit, saved filters, live counts |
| 9 | Open roles | Board, raise-a-hand, who's hiring |
| 10 | Monetization | Castly Pro, Paystack, entitlements, analytics |
| 11 | Hardening | Performance against §25 budgets, device testing, NDPA paths, CSAM procedures |

**Suggested cut line for a first release: milestones 1–7.** That is the complete core loop — a talent can build and publish a portfolio, a verified booker can discover and shortlist them, and both can talk. Filters, open roles, and Pro are additive and can follow without changing the architecture. Shipping at 7 gets you real answers to the riskiest product questions months earlier than shipping at 11.

The deck spike (former milestone 0) is omitted. Device measurement happens at the end of M2 (section preview) and at the start of M5 (card shell, before ranking). If §25 is missed, either relax the named budgets or take the expand-on-tap fallback in §26.1.

---

## 25. Performance budgets

Treated as acceptance criteria, measured on a 2GB-RAM Android device over throttled 3G.

| Metric | Budget |
|--------|--------|
| App cold start to interactive | < 3.0s |
| Deck: first card visible | < 2.5s |
| Deck: card-to-card transition | < 100ms |
| Swipe gesture to visual response | < 16ms (UI thread) |
| Card scroll | sustained ≥ 55fps |
| `deck.next` p95 | < 400ms |
| Candidate generation SQL p95 | < 120ms |
| `search.count` p95 | < 300ms |
| Decision-layer payload per card | < 150KB |
| Portfolio publish (excluding upload) | < 1.5s |

---

## 26. Open technical questions

1. **M5 measurement gate.** At the start of Deck v1, measure swipe and scroll of the inline-portfolio card on a 2GB Android over throttled 3G *before* building the ranking engine. If §25 is missed: (a) relax the named budgets, or (b) keep the depth layer but load it on an explicit expand rather than on scroll. Do not proceed to scoring until that decision is written down.
2. **Supabase Realtime at scale.** Adequate for v1 chat volumes. The migration path if it is not is a dedicated websocket service; the schema does not change.
3. **Verification unit costs.** The §16 model needs real volume quotes from Smile ID and Dojah before the free-for-everyone position is financially confirmed.
4. **Store billing** (§17) — unresolved and blocking for Pro, not for launch.
5. **Attribute storage shape.** `talent_attributes` as a definition-driven table is flexible and ops-editable but costs query complexity. If filter latency misses budget, promote the hottest attributes to typed columns on `talent_search`. The projection table exists partly to make that change cheap.
6. **Sensitive-tier assignments** (§7.3.1) are a starting proposal awaiting legal and practitioner review. The mechanism is built to be data-driven so the assignments can change without code changes.
7. **Multi-country** (Phase 3) implies per-country taxonomies, currencies, and KYC providers. The schema carries country on the relevant tables, but pricing, payments, and verification will each need provider abstraction.
