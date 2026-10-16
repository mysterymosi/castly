# M5 — Deck v1

**Goal.** A booker completes a 50-card session: swipe, shortlist, inspect why each card appeared. Fairness invariants hold in tests. Gestures are measured on target hardware before the ranking engine is treated as done.

**Depends on.** M2 — live talents, section renderers, `talent_search`, media posters. M4 — booker profile, vertical weights, projects/roles.

**Spec references.** PRD §7.2. TECH_SPEC §5.6, §7, §10, §22.2–§22.3, §25, §26.1.

**Order is load-bearing.** Tasks 5.1–5.3 (card shell + measurement) happen before 5.4–5.10 (ranking). Do not build scoring until the card is measured.

Right-swipe is **ungated** in this milestone. `verifiedBooker` becomes real in M7.

---

## Tasks

### 5.1 Card shell and direction lock

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

Only the focused card mounts the section list. n+1 and n+2 show decision layer (poster + blurhash). Depth layer mounts on first scroll intent. One video element, focused card, section ≥50% visible. Prefetch decision-layer payloads for next 5 cards (target &lt; 150KB each) and full sections only for n+1.

**Acceptance.** Flip through 10 cards while Charles proxy (or equivalent) is recording: adjacent cards do not download full showreels. Only one HLS player exists at a time.

### 5.3 Data-saver and measurement gate (do this before ranking)

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

Tables: `deck_sessions` (optional `role_id`, `goal_count`, `seed`), `deck_queue`, `swipes`, `deck_impressions`, `talent_exposure_daily`, `profile_views`.

`deck.start` creates a session, runs stages 1–3, writes `deck_queue`.

**Acceptance.** Starting two sessions with different seeds for the same booker does not produce identical first-10 talent ids when the pool is large enough.

### 5.5 Stage 1 — candidate generation

Single SQL against `talent_search`, ~500 rows. Hard filters: live, category from vertical weights or role category, geo, 30-day pass decay for the role, blocks, standard-tier filters (filter UI may still be thin; the query builder must accept the filter object). Sensitive-tier filters not applied unless a role with a non-empty brief is active — even if M8 UI is not shipped, the guard belongs here.

p95 &lt; 120ms on a seeded Lagos-sized set.

**Acceptance.** `EXPLAIN ANALYZE` on the candidate query meets 120ms p95 locally against a seed of ≥1,000 live rows. A talent passed for role A still appears for role B.

### 5.6 Stage 2 — scoring (`packages/core`)

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

After scoring: exposure penalty (7-day impressions above a percentile, proportional, not a hard cap), exploration injection (~20% from lowest lifetime-impression decile), diversity spacing (no more than N consecutive same category/city/agency).

**Acceptance.** Property tests: exploration fraction met when eligible under-seen talents exist; sparse pool still returns enough cards (penalty does not empty the deck).

### 5.8 Stage 4 — queue, `deck.next`, impressions

`deck.next` reads the cursor. Record impression on serve. Refill when &lt; 10 unserved. Exhaustion payload lists filter relaxations ranked by how many results each unlocks.

**Acceptance.** Paging is stable if quality scores change mid-session (queue is materialised). Exhaustion on an over-filtered role returns suggestions, not random padding. `deck.next` p95 &lt; 400ms.

### 5.9 Swipe, undo, shortlists

Left = pass (role-scoped, 30-day decay). Right = interest **and** shortlist entry (role shortlist or general Saved talent). Save-for-later. Undo last swipe (limit for free bookers — use a constant; Pro unlimited in M10).

Compare view: shortlisted talents side by side on key attributes.

Session goal optional with progress.

**Acceptance.** Right-swipe of Tunde for an active role puts Tunde on that role's shortlist. Undo restores queue position and removes the shortlist row. Compare shows two shortlisted talents' height/language/credits.

### 5.10 Deck inspector

Admin: run a deck as a given booker + optional role; show each card's score components and `reasons`.

Live-edit `ranking_weights` without deploy.

**Acceptance.** An admin can explain why card #3 ranked where it did, matching the `reasons` array written to `deck_queue`.

### 5.11 Why-you're-seeing-this on the card

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
