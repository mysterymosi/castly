# M5 — Deck v1

**Goal.** A booker completes a 50-card session: swipe, shortlist, inspect why each card appeared. Fairness invariants hold in tests. Gestures are measured on target hardware before the ranking engine is treated as done.

**Depends on.** M2 — live talents, section renderers, `talent_search`, media posters. M4 — booker profile, vertical weights, projects/roles.

**Spec references.** PRD §7.2. TECH_SPEC §5.6, §7, §10, §22.2–§22.3, §25, §26.1.

**Order is load-bearing.** Tasks 5.1–5.3 (card shell + measurement) happen before 5.4–5.10 (ranking). Do not build scoring until the card is measured.

Right-swipe is **ungated** in this milestone. `verifiedBooker` becomes real in M7.

---

## Tasks

### 5.1 Card shell and direction lock

**Status:** Built; device acceptance pending. Mobile Discover tab (`app/(tabs)/discover.tsx`, `src/deck/`): `SwipeDeck` + `DeckCard` (one FlashList: lead media → identity → sections in studio order) + `DeckCardPreview` (next card, decision layer only). Gestures on the UI thread: pan `activeOffsetX ±15` / `failOffsetY ±10`; the card's scroll view is a `Gesture.Native()` that `requireExternalGestureToFail(pan)` — a strict direction lock (the spec's `simultaneousWithExternalGesture` would let a diagonal drag swipe and scroll at once); a touch that lands while the list coasts after a fling fails the pan. Commit on distance (28% width) or flick (900 pt/s), spring with velocity, haptic at commit; reduced motion drops tilt/scale. Docked Pass / Save / Share / Interested run the same exit; decisions only advance until 5.9; Share opens the native sheet with the public URL. Crew/production/events cards open at the identity block with work samples below (`initialScrollIndex` 1). Lead media steps by tap (left/right halves) — a nested horizontal pager would fight the swipe. Cards come from an interim booker-only `deck.preview` (`apps/api/src/deck/`, live talents newest-first, own profile excluded, `serializeTalent` as an unverified booker) returning the `DeckCard` shape (`packages/schema/src/deck.ts`) that `deck.next` will reuse. Demo data: `pnpm --filter api seed:deck -- <donor-email…>` (12 live talents, on-camera + crew, copying donors' ready media). `GestureHandlerRootView` added at the app root.

Horizontally swipeable deck. Vertical FlashList of sections inside the focused card.

Gesture arbitration (TECH_SPEC §10.1):

- `activeOffsetX: [-15, 15]`, `failOffsetY: [-10, 10]`
- first significant movement claims the axis for the gesture
- swipe suppressed while scroll has momentum
- Reanimated worklets only — no JS thread in the gesture path

Swipe is the primary action; docked Pass / Interested / Save / Share are secondary.

On-camera cards open at the decision layer. Crew/creative cards open partially expanded on work samples.

**Acceptance.** On the 2GB device: a vertical scroll does not fire a swipe; a horizontal swipe does not scroll. Buttons still work. Crew fixture opens mid-portfolio.

### 5.2 Prefetch and mount discipline

**Status:** Built; proxy acceptance pending. `SwipeDeck` mounts three cards keyed by talent: the focused `DeckCard` and n+1, n+2 as `DeckCardPreview` (lead photo + blurhash, no list, no video). The focused card's list starts as lead + a muted placeholder; sections (the depth layer) replace it on the first `onScrollBeginDrag`. Crew/production/events cards mount them at once, since they open on their work. `PortfolioVideoGate` (`packages/portfolio-native`) gates players: the deck activates only the first showreel section ≥50% visible (FlashList viewability), and every other video renders its poster. A dev-only warning fires if a second HLS player mounts (`studio/portfolio-media.tsx`). `useDeckPrefetch` (`src/deck/prefetch.ts`) warms the image cache with the lead photo of the next 5 cards, plus every section photo and video poster of n+1 only. HLS is never prefetched. Card data still arrives in a single `deck.preview` call; the per-card payload split applies when `deck.next` pages (5.8). Payload check: `pnpm --filter api measure:deck-payload` reports about 5KB of JSON per card. But the lead image is 450–720KB, because Supabase Storage (the stopgap image provider) serves the original for every variant. That puts 13 of 14 seeded cards over the 150KB decision-layer budget. Decided at 5.3: keep the budget, and re-measure once images move to Cloudflare Images (`docs/plans/measurements.md`).

Only the focused card mounts the section list. n+1 and n+2 show decision layer (poster + blurhash). Depth layer mounts on first scroll intent. One video element, focused card, section ≥50% visible. Prefetch decision-layer payloads for next 5 cards (target &lt; 150KB each) and full sections only for n+1.

**Acceptance.** Flip through 10 cards while Charles proxy (or equivalent) is recording: adjacent cards do not download full showreels. Only one HLS player exists at a time.

### 5.3 Data-saver and measurement gate (do this before ranking)

**Status:** Data-saver built; the measurement gate is **open**, with device numbers pending. The payload miss is accepted as a stopgap until images move to Cloudflare Images, when it is re-measured. Data-saver (`src/media/data-saver.ts`) is a persisted device-wide setting. When on, a showreel mounts no source until the user taps play, then loads Mux's lowest rendition (`?max_resolution=270p`), with the poster and a spinner up until the first frame. The deck also stops prefetching n+1's portfolio images. It is reachable in one tap from the Discover header (`DataSaverToggle`). An inline offer (`DataSaverOffer`) appears on metered or slow connections. These are detected with NetInfo (`isConnectionExpensive`, 2G/3G `cellularGeneration`) rather than `expo-network`, which reports only the connection type in SDK 57. Measurement logging (`EXPO_PUBLIC_MEASURE=1`): `deck.first_card`, `deck.transition`, and a UI-thread `deck.scroll` frame meter (`src/lib/frame-meter.ts`). Method, results and the pending decision are in `docs/plans/measurements.md`.

Data-saver: lowest HLS rendition, poster + tap-to-play. Offered when `expo-network` reports metered/slow cellular; one tap from the deck, not buried in settings.

Measure on 2GB Android, throttled 3G, against §25:

| Metric | Budget |
|--------|--------|
| First card visible | &lt; 2.5s |
| Card-to-card transition | &lt; 100ms |
| Swipe to visual response | &lt; 16ms |
| Card scroll | ≥ 55fps sustained |
| Decision-layer payload | &lt; 150KB |

**Acceptance.** Results logged in `docs/plans/measurements.md`. If missed: **stop**. Choose (a) relax the named budget in TECH_SPEC §25, or (b) load the depth layer on explicit expand rather than scroll (TECH_SPEC §26.1). Write the decision in the measurement log before continuing to 5.4.

### 5.4 Deck session schema and `deck.start`

**Status:** Built, started while the 5.3 device rows were still pending. Tables are in migration `0011_deck_sessions` (`packages/db/src/schema/deck.ts`), all with default-deny RLS. `deck_sessions` stores an integer `seed`. `deck_queue` has the primary key `(session_id, position)` and is unique per `(session, talent)`; `reasons` is a jsonb array of `{code, contribution}`. Each swipe gets one row, and an undo sets `undone_at`. `deck.start` (booker-only, `apps/api/src/deck/session.ts`) needs a finished booker profile, and accepts only the booker's own role. It runs stage 1 → `scoreCandidates` → `applyFairness` (`packages/core/src/deck.ts`) and writes the queue in one transaction. The stages are interim:
- **Stage 1:** live talents other than the booker, by `quality_score` descending, with ties ordered by `md5(talent_id || seed)`. Replaced by 5.5.
- **Stage 2:** quality only, with a stable sort, so tied talents keep stage 1's seeded order. Replaced by 5.6.
- **Stage 3:** passes the order through unchanged. Replaced by 5.7.

5.5–5.7 replace these behind the same signatures. Since 5.8 the app uses `deck.start` + `deck.next`; `deck.preview` stays only for `measure:deck-payload`. Acceptance is covered by `deck/session.integration.test.ts`: seeds 1 and 2 give different first-10 decks from a 15-talent tied pool, and seed 1 replays exactly.

Tables: `deck_sessions` (optional `role_id`, `goal_count`, `seed`), `deck_queue`, `swipes`, `deck_impressions`, `talent_exposure_daily`, `profile_views`.

`deck.start` creates a session, runs stages 1–3, writes `deck_queue`.

**Acceptance.** Starting two sessions with different seeds for the same booker does not produce identical first-10 talent ids when the pool is large enough.

### 5.5 Stage 1 — candidate generation

**Status:** Built. `apps/api/src/deck/candidates.ts` has two parts:
- **`resolveCandidateScope`** turns the booker, role and filters into a scope.
- **`candidateQuery`** is one query over `talent_search`, capped at 500 rows, ordered by quality with the seeded tiebreak.

Its hard filters:
- **Status:** live, and not the booker's own profile.
- **Country:** the booker's city's country.
- **Category:** the role's category if it has one, plus any category filter. When neither names a category, the vertical's categories with weight above 0 apply. Each set includes its child categories.
- **Swipes:** none in the last 30 days for the same role (or for no role), not undone. A talent passed for role A still appears for role B.
- **Blocks:** neither side has blocked the other. These are two anti-joins, so each direction can use an index.
- **Standard filters:** `deckFiltersSchema` (`packages/schema/src/deck.ts`) covers categories, cities, regions, skills, languages, accents, `rateDayMax`, `hasShowreel` and `minCredits`. A hidden or unset rate never fails `rateDayMax`.

New schema in migration `0012_deck_candidate_filters`:
- **`blocks` table**, laid out per TECH_SPEC §5.8. The block action itself ships in M7.6.
- **`deck_sessions.filters`**, so a refill (5.8) re-runs the same scope.

Attribute filters go through the one guard, `checkAttributeFilters` (`packages/core/src/sensitive-filter-guard.ts`), which reads tiers from `attribute_definitions`:
- **Unknown keys** are rejected.
- **Sensitive keys** are rejected unless the session's role has a brief. With a brief they join the role's requirements for `roleSoftMatch` (5.6) and never reach SQL.
- **Standard attribute keys** (e.g. `height_cm`) are rejected for now, because `talent_search.attrs` is empty until M8. A filter on them would match nobody.

Left for M8: the `sensitive_filter_audit` row (8.4), standard attribute filters (8.1), and the `onRequest` group for hidden rates in search (8.3). Acceptance:
- **Behaviour:** covered by `deck/session.integration.test.ts`.
- **Latency:** measured with `pnpm --filter api measure:candidates`, results in `docs/plans/measurements.md`. Against 1,214 live rows, p95 is under 2.2ms in every scenario.

Single SQL against `talent_search`, ~500 rows. Hard filters: live, category from vertical weights or role category, geo, 30-day pass decay for the role, blocks, standard-tier filters (filter UI may still be thin; the query builder must accept the filter object). Sensitive-tier filters not applied unless a role with a non-empty brief is active — even if M8 UI is not shipped, the guard belongs here.

p95 &lt; 120ms on a seeded Lagos-sized set.

**Acceptance.** `EXPLAIN ANALYZE` on the candidate query meets 120ms p95 locally against a seed of ≥1,000 live rows. A talent passed for role A still appears for role B.

### 5.6 Stage 2 — scoring (`packages/core`)

**Status:** Built. `scoreCandidates` (`packages/core/src/deck.ts`) is the weighted sum below. Each term's contribution goes into `components`, and each term that adds more than 0 appends a reason. `detail` names what matched, never a talent's values: the geo level, or the role requirement keys that matched fully. No candidate is ever removed, and the sort is stable, so ties keep stage 1's seeded order.

The terms:
- **`verticalCategoryMatch`:** the existing core function.
- **`geoProximity`:** same city 1, same region 0.6, same country 0.3.
- **Quality, freshness, responsiveness:** each `talent_search` score divided by 100.
- **`roleSoftMatch`:** the mean match across the role's requirements:
  - **Range:** 1 inside it, falling to 0 at 10% of the bound outside it.
  - **`anyOf` / `equals`:** 1 or 0.
  - **Unknown value:** 0.5, so a missing value is neither a match nor a miss.
  - **Sensitive requirements:** count only on a briefed role.
- **Raised hand:** adds a fixed `w_raised_hand` when the talent has raised a hand on the role. Always 0 until M9.
- **Boost:** capped at `boost_cap_fraction` (default 0.1) of the highest organic score under the current weights. Always 0 until M10.

Weights:
- They come from `ranking_weights` (`w_vertical`, `w_geo`, `w_quality`, `w_freshness`, `w_responsiveness`, `w_role`, `w_raised_hand`, `boost_cap_fraction`), read through a 60-second cache (`apps/api/src/deck/ranking-weights.ts`).
- A key with no row uses the default from `DEFAULT_RANKING_WEIGHTS`: 1 / 0.6 / 0.8 / 0.4 / 0.2 / 1 / 0.3. Negative values and unknown keys are ignored.

Inputs: stage 1 also returns region, country, freshness, responsiveness, and the language and accent ids. Role matching reads languages and accents as slugs. Other attributes count as unknown until M8 projects them onto `talent_search`.

Acceptance:
- **Property tests** (`deck.property.test.ts`, fast-check): no candidate is dropped and every score is finite; sensitive attributes change nothing without a briefed role; the boost stays within its cap for any weights and any boost, and adds 0 at 0.
- **Golden decks:** `golden-decks.test.ts` against `src/__golden__/*.json` (cold start in Lagos, an unbriefed Yoruba lead, the same lead with a brief). Accept an intended change with `pnpm --filter @workspace/core test -- -u`.
- **API:** integration tests cover the language-match ordering and a `ranking_weights` override.

Pure function. Weights from `ranking_weights` cached 60s.

```
score = w_vertical × verticalCategoryMatch
      + w_geo × geoProximity
      + w_quality × qualityScore
      + w_freshness × freshnessScore
      + w_responsiveness × responsivenessScore
      + w_role × roleSoftMatch
      + w_raised_hand × raisedHandFlag   // always 0 until M9
      + boostContribution                // always 0 until M10, still capped in code
```

Each term appends to `reasons[]`. `roleSoftMatch` never excludes. Follower count is not an input. Sensitive attributes only via `roleSoftMatch` when a role is active.

**Acceptance.** Property tests (fast-check): roleSoftMatch never drops a candidate; sensitive attributes do not change score without an active briefed role; boost cap holds at 0 and at max. Golden-deck fixtures committed.

### 5.7 Stage 3 — fairness

**Status:** Built. `applyFairness` (`packages/core/src/fairness.ts`) runs three steps. None of them drops a card, so the output is always a reordering of the input.

1. **Exposure penalty.**
   - The threshold is the platform's 90th percentile of 7-day impressions, counting every live talent, with unseen ones as 0. It's computed in `apps/api/src/deck/exposure.ts` and cached for 10 minutes.
   - The penalty never starts below 20 impressions.
   - Above the threshold, the score is cut by `strength × (impressions / threshold − 1)`, up to a maximum share.
   - The cut is recorded as an `exposure` reason with a negative contribution, so the reasons still sum to the stored score.
2. **Exploration.**
   - A fifth of the slots (`exploration_fraction`), spread evenly, are reserved.
   - Talents for them are drawn in a seeded order from the lowest 10% of candidates by lifetime impressions (`exploration_decile`).
   - Exploration only promotes. A drawn talent whose own score already ranks them earlier keeps that place. Only a talent placed ahead of a higher-scored card is marked `explored` and gets an `exploration` reason, with contribution 0.
3. **Diversity spacing.**
   - No more than 3 cards in a row may share a category (any in common), a city, or a managing agency. The agency is the earliest active `profile_delegates` grant.
   - When the next card would break that, the first card within 20 places that doesn't takes its spot. In a narrow pool, such as a role whose category every candidate shares, the order stands.

The settings are `ranking_weights` keys with defaults in `DEFAULT_FAIRNESS_CONFIG`, read through the same 60-second cache as the weights (`loadRankingConfig`). Values out of range are ignored.

| Key | Default |
|---|---|
| `exposure_percentile` | 0.9 |
| `exposure_min_impressions` | 20 |
| `exposure_penalty_strength` | 0.25 |
| `exposure_penalty_max` | 0.25 |
| `exploration_fraction` | 0.2 |
| `exploration_decile` | 0.1 |
| `diversity_max_run` | 3 |
| `diversity_window` | 20 |

Exposure is read from `talent_exposure_daily`, which `deck.next` (5.8) updates as it serves cards.

Acceptance:
- **Property tests** (`fairness.property.test.ts`):
  - Every card comes back exactly once, including a sparse pool where every talent is over-exposed, and no score goes below 0.
  - Exploration draws `min(slots, eligible)` talents, and by each reserved slot at least that many drawn talents have been placed.
  - Only talents from the lowest lifetime-impression share are promoted.
  - Reasons always sum to the score.
  - A varied pool never has a run longer than the maximum.
- **Golden decks:** these now run stages 2 and 3, with an over-exposed fixture (Bisi) and a never-seen one (Zainab).
- **API:** an integration test shows a talent with 500 impressions this week ranked below an otherwise-equal one, with the penalty in their reasons.

After scoring: exposure penalty (7-day impressions above a percentile, proportional, not a hard cap), exploration injection (~20% from lowest lifetime-impression decile), diversity spacing (no more than N consecutive same category/city/agency).

**Acceptance.** Property tests: exploration fraction met when eligible under-seen talents exist; sparse pool still returns enough cards (penalty does not empty the deck).

### 5.8 Stage 4 — queue, `deck.next`, impressions

**Status:** Built. `deck.next({ sessionId, limit = 10 })` (`apps/api/src/deck/next.ts`) is a booker-only mutation, because serving a page writes. Each call is one transaction holding a lock on the session row, so two calls can't serve the same cards. In order, it:

1. **Refills if needed.** If serving the page would leave fewer than 10 unserved cards, it re-runs stages 1–3 with the session's own role, filters and seed. Stage 1 skips everyone already in this session's queue, served or not, via `excludeQueuedIn`. The results are appended after the last position.
2. **Serves the next page** in position order. It skips any queued talent who has since gone non-live, or who blocked or was blocked by the booker mid-session.
3. **Records the serve.** It marks the rows `served_at` and writes a `deck_impressions` row for each card. It also adds the impression to today's `talent_exposure_daily` row in the same transaction. This differs from the spec, which has a nightly roll-up: the API has no job runner, and this keeps stage 3's exposure data current.

Cards come back as `deckQueuedCardSchema`: the usual `DeckCard` plus `position` and the stored `reasons`, ready for 5.11. Impressions are recorded on serve, so a page counts as seen once fetched. `max_scroll_depth` and `dwell_ms` stay empty until the app reports them.

**Exhaustion.** `exhausted` is true once nothing is left to serve, even after a refill. `suggestions` then lists each filter in the session whose removal would bring talent back, with how many it unlocks, sorted from most to fewest; filters that unlock no one are left out. Each count re-resolves the scope without that filter, so dropping `categoryIds` falls back to the vertical's categories, and skips everyone already queued. The deck is never padded with off-filter talent. The app has no filter UI until M8, so it doesn't show suggestions yet.

**App.**
- `useDeckSession` (`apps/mobile/src/deck/use-deck-session.ts`) opens the session and first page in a query that never refetches or retries on its own. It then asks for further pages through `SwipeDeck`'s `onNearEnd` once 5 cards remain.
- `SwipeDeck` keeps each card's motion values when pages are appended. When the booker runs out of loaded cards, it shows "Finding more talent" while a page loads, an inline retry if loading failed, and the end screen only once the session is exhausted.
- "Start over" opens a new session, and the screen keys the deck by session.

Acceptance (`deck/session.integration.test.ts`, `describe("deck.next")`):
- **Paging:** pages arrive in position order with no repeats, and impressions and exposure are recorded.
- **Stable order:** a quality change mid-session doesn't change the order of the cards still to come.
- **Refill:** a talent published after the session started arrives through a refill without repeating anyone.
- **Exhaustion:** a role with `{ minCredits: 5, hasShowreel: true }` that matches nobody returns suggestions in order: `minCredits` (2) then `hasShowreel` (1).
- **Serve-time skips and ownership:** both are covered.
- **Latency:** `pnpm --filter api measure:deck-next` gives p95 76.6ms locally (`docs/plans/measurements.md`).
- **On device:** checked on the iOS simulator, swiping to the end screen and starting over.

`deck.next` reads the cursor. Record impression on serve. Refill when &lt; 10 unserved. Exhaustion payload lists filter relaxations ranked by how many results each unlocks.

**Acceptance.** Paging is stable if quality scores change mid-session (queue is materialised). Exhaustion on an over-filtered role returns suggestions, not random padding. `deck.next` p95 &lt; 400ms.

### 5.9 Swipe, undo, shortlists

**Status:** Built. Product decisions taken: "Save for later" always goes to Saved talent, whatever the role. A free booker gets `FREE_UNDO_LIMIT = 3` undos per session.

**API** (`apps/api/src/deck/swipe.ts`). Each call holds the same session lock as `deck.next`.
- **`deck.swipe({ sessionId, position, direction })`** decides on a card that has been served:
  - **pass** records the swipe only. Stage 1 then hides the talent for that role, or for no role, for 30 days.
  - **interest** adds the talent to the role's shortlist, or to Saved talent when there's no role. The list is created on first use and named after the role.
  - **save** adds the talent to Saved talent.
  - Each card can have one live decision per session: a unique partial index on `swipes (session_id, position)` where the swipe isn't undone. Interests also count into `talent_exposure_daily.interests`.
- **`deck.undo({ sessionId })`** takes back the session's latest live swipe:
  - It sets `undone_at`, so the swipe no longer hides the talent.
  - It removes the shortlist entry only if this swipe created it and no other live swipe also put the talent there.
  - It takes the interest back off the exposure count.
  - It returns the card's position and talent, so the app steps back to it. The queue row stays served, because the card is still on the phone.
- **`deck.setGoal({ sessionId, goalCount | null })`** sets or clears the goal. Swipe, undo and set-goal all return `goal: { target, shortlisted }`, where `shortlisted` counts the session's live interest swipes, and `undosLeft`.

Migration `0013_deck_swipes_session` adds to `swipes`: `session_id`, `position`, `shortlist_id` and `entry_added`, the unique live index, and a `session_id` index for the foreign key.

**Shortlists** (`apps/api/src/shortlist/`):
- **`shortlist.list`:** Saved talent first, with each list's project and entry count.
- **`shortlist.get`:** the list's entries.
- **`shortlist.compare({ shortlistId, talentIds })`:** 2–4 talents from one list.

- **`shortlist.remove({ shortlistId, talentId })`:** takes a talent off the list. The swipe that put them there stands, so they stay out of that role's deck, and a later undo of that swipe leaves the list alone.
- **`shortlist.setNote({ shortlistId, talentId, note })`:** the booker's private note on an entry, trimmed and up to 500 characters. A blank note clears it.
- **`shortlist.reorder({ shortlistId, talentIds })`:** the booker's order, top first, written to `shortlist_entries.rank`. Entries left out, and later right-swipes, are unranked and sort below it, newest first.

These three are TECH_SPEC §6's `addNote` and `reorder` plus removal. No later milestone schedules them, so they were added here. Each returns the list's new detail. `shareLink` (the PRD's v1 read-only share link) is also unscheduled and not built yet.

Entries and compared talents are deck cards built by `deckCard`. Talent data leaves the API only through `serializeTalent` (TECH_SPEC §6.1, which the guard test enforces), and compare therefore shows only what this booker may see. A talent who has gone offline stays on the list but isn't shown.

**App:**
- **Discover:**
  - Each decision is sent to `deck.swipe`. Swipe, undo and goal calls are queued one at a time, so an undo can't overtake its swipe on the server.
  - An Undo pill appears after a swipe while undos remain, and the deck slides the card back in.
  - A goal chip reads "Set a goal" or "n of N shortlisted", and turns green when the goal is met.
  - Opened from a role's "Find talent" button (`?roleId=&roleName=`), the deck casts for that role, shown by a "For <role>" chip that can be cleared.
- **Projects:**
  - A Shortlists list.
  - A shortlist screen where you pick 2–4 talents to compare. Notes show under each talent. Edit mode gives each row up/down and remove buttons (with a confirm), and tapping a talent opens a note sheet.
  - A compare table that scrolls sideways. Its rows are category, city, every visible attribute any of them has (height, playing age…), languages, accents, skills, credits, signature credit and day rate.

Acceptance:
- **`deck/swipe.integration.test.ts`:**
  - A right-swipe for an active role puts Tunde on that role's shortlist.
  - Save and a role-less interest both land on Saved talent.
  - Pass hides the talent from that role's next deck.
  - An unserved card is rejected, and so is a second decision on the same card.
  - Undo removes the shortlist row, returns the position and frees the card, but keeps an entry another live swipe also made.
  - Undos stop after 3 per session, and the goal progress is correct.
  - Compare shows two talents' height, languages and credits, and refuses a talent who isn't on the list.
  - Shortlists stay private to their booker.
  - Remove, note (set, trim, clear) and reorder work, later saves land below the booker's order, and another booker can't edit the list.
- **The fixtures** these tests share moved to `src/test/deck-fixtures.ts`.
- **On the iOS simulator** (`.maestro/deck-shortlist.yaml`): Interested, Undo (the card returns), two Interested, a goal of 5 showing "2 of 5 shortlisted", Projects → Shortlists → Saved talent, selecting two, then Compare. `.maestro/shortlist-edit.yaml` (run after it): Edit, move down, add a note, remove with confirm, Done.

Left = pass (role-scoped, 30-day decay). Right = interest **and** shortlist entry (role shortlist or general Saved talent). Save-for-later. Undo last swipe (limit for free bookers — use a constant; Pro unlimited in M10).

Compare view: shortlisted talents side by side on key attributes.

Session goal optional with progress.

**Acceptance.** Right-swipe of Tunde for an active role puts Tunde on that role's shortlist. Undo restores queue position and removes the shortlist row. Compare shows two shortlisted talents' height/language/credits.

### 5.10 Deck inspector

**Status:** Built. The admin console (`apps/admin`) now has sign-in, so this task also gives TECH_SPEC §19 its foundation.

**Admin sign-in** (`apps/admin`):
- Email OTP through the existing `auth.requestOtp` and `auth.verifyOtp`. A server action checks `auth.me` for the admin mode before it sets any cookie, so a non-admin never gets a session.
- The session is three httpOnly cookies (`lib/session-cookies.ts`): access token, refresh token and expiry.
- `proxy.ts` (Next 16's renamed middleware) sends a visit with no session to `/sign-in`. It refreshes an access token within 60s of expiry, writing the new one to both the request and the response so the current render uses it.
- Pages still check for real with `requireAdmin()` (`lib/auth.ts`, one `auth.me` per request). Every admin procedure is behind `adminProcedure` regardless.
- Admin mode is still granted by ops in SQL (`insert into user_modes (user_id, mode) values (…, 'admin')`).

**API** (`apps/api/src/admin/`). None of these write, except `rankingWeights.update`.
- **`admin.bookers.search({ query })`:** email or company name.
- **`admin.deck.booker({ bookerId })`:** the booker's roles and their 10 latest sessions, each with seed, filters, and served/queued counts.
- **`admin.deck.run({ bookerId, roleId?, filters?, seed?, overrides?, limit })`:** stages 1–3 exactly as `deck.start` runs them (`rankCandidatesInDetail`), writing no session, queue, impressions or exposure. Each card carries:
  - every stage-2 component, zeros included;
  - its stage-2 rank before fairness;
  - the exposure penalty and the exploration flag;
  - 7-day and lifetime impressions;
  - the `reasons` `deck.start` would store;
  - the card as the booker sees it.

  `seed` replays a session's exploration draw. `overrides` try settings for that run only.
- **`admin.deck.session({ sessionId })`:** a real session's `deck_queue` as stored (score, reasons, served time, live decision), with cards.
- **`admin.rankingWeights.list` / `update({ key, value | null })`:** every tunable setting (`RANKING_SETTINGS` in `packages/core`), with its default, stored value and who last changed it. `null` deletes the row, so the default applies again.
  - Values are checked by `rankingSettingProblem`, which is never looser than the deck's readers, so a saved value is always used.
  - An update clears this process's 60s cache. Other API instances pick it up within a minute.

New error codes: `booker_not_found` (NOT_FOUND) and `invalid_ranking_setting` (BAD_REQUEST).

**Pages:**
- **`/deck`:** search for a booker.
- **`/deck/[bookerId]`:**
  - the booker's sessions, each with a "Re-run with this seed" link;
  - a run form (role, seed, card count, filters JSON, and trial settings);
  - the breakdown table: position, talent, score, stage-2 rank with ↑/↓, eight component columns, penalty, impressions, and the reasons.
- **`/deck/sessions/[sessionId]`:** the stored queue.
- **`/ranking`:** the settings, each saved or reset in place, with inline errors.

A replay matches its session until exposure moves or the booker swipes, because a swipe hides that talent from stage 1.

Acceptance:
- **`admin/deck-inspector.integration.test.ts`:**
  - `deck.start` with seed 4242, then `admin.deck.run` with the same seed. Card #3 has exactly the `reasons` and score stored at `deck_queue` position 3, every positive component appears among its reasons, and `admin.deck.session` returns the same row.
  - A run writes nothing.
  - Overrides apply to one run and aren't saved. Invalid ones are refused.
  - A saved weight is what the next run uses, and a reset restores the default.
  - Invalid values are refused, and non-admins get FORBIDDEN.
- **`packages/core` `ranking-settings.test.ts`:** every setting is listed once, and every accepted value is one the readers use.
- **In a browser** (local test admin `onboarding+ops@resend.dev`):
  - sign-in, plus the redirect for no session, refresh for an expired token, and sign-in again for a bad refresh token;
  - booker search;
  - re-running a stored role session reproduced its four cards, order, scores and reasons;
  - saving, resetting and refusing `diversity_max_run = 2.5` on `/ranking`.

Admin: run a deck as a given booker + optional role; show each card's score components and `reasons`.

Live-edit `ranking_weights` without deploy.

**Acceptance.** An admin can explain why card #3 ranked where it did, matching the `reasons` array written to `deck_queue`.

### 5.11 Why-you're-seeing-this on the card

**Status:** Built. `deckReasonText(reasons, facts, weights)` (`packages/core/src/reason-text.ts`) reads the stored `reasons` into one line of up to three parts joined by " · ", for example "Speaks Yoruba · In Lagos · Matches your role". The parts come in this order:
- **Promoted:** for a boost (M10). It comes first, so it's always disclosed.
- **Discovery pick:** for an exploration slot.
- **The role's languages and accents** that matched fully, like "Speaks Yoruba" or "Yoruba accent".
- **Where they are:** "In Lagos" for the same city, "Near you" for the same region.
- **Matches your role:** when any requirement matched fully. A partial or unknown match claims nothing.
- **Raised a hand for this role:** M9.
- **The strongest plain term**, only if there's room and it scored at least 70% of its weight: "Strong portfolio", "Recently updated" or "Replies quickly".
- **In your country:** only when nothing else applies. A card with none of these gets no line.

The line names values only as the serialized card already shows them to this booker. `apps/api/src/deck/reason-text.ts` intersects the role's requested language and accent slugs with the card's visible languages and accents, and takes the city from the card. The reasons themselves still carry only keys and levels, so a sensitive value can never appear.

`deck.next` sends it as `reasonText` on each card, and `admin.deck.run` returns the same line, which the inspector shows above the reasons. On the app it's a sparkle row under the caption's credit line (testID `deck-card-reason`, announced as "Why you're seeing this: …"). Preview cards have no line.

Acceptance:
- **`packages/core` `reason-text.test.ts`:** runs on `scoreCandidate` and `applyFairness` output. It covers the Yoruba lead, no claim on a partial match, the city-name fallback, region and the strong-term threshold, boost disclosure and the exploration label.
- **`deck/session.integration.test.ts`:** a Lagos Yoruba actress on a Yoruba role gets `deck.next` reasons equal to the stored ones, and the line "Speaks Yoruba · In Lagos · Matches your role". The talent with no language on record gets "In Lagos · Strong portfolio".

Surface a short string from `reasons[]` on the card.

**Acceptance.** A Lagos Yoruba actress matching an active role shows a reason that a human can read, derived from the same array scoring produced.

---

## Exit gate

50-card session on the 2GB device at the (possibly relaxed) budgets. Golden decks and property tests pass in CI. Inspector shows every score component. Right-swipe writes a shortlist entry.

## Deferred

- `verifiedBooker` gate on right-swipe (M7)
- Full filter UI (M8) — query builder must still accept filters
- `raisedHandFlag` non-zero (M9)
- Boost non-zero (M10)
- Fairness simulation Gini report (M11)
- Shareable read-only shortlist link (nice-to-have here; required eventually)

## Risks

| Risk | Decision if it materialises |
|------|------------------------------|
| §25 missed at 5.3 | Relax named budgets **or** expand-on-tap fallback; do not silently ship jank |
| Candidate SQL &gt; 120ms | Promote hot attributes on `talent_search` (TECH_SPEC §26.5); do not add Elasticsearch in v1 |
