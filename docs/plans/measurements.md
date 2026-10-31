# Measurement log

Device measurements against TECH_SPEC §25. Each gate records how it was measured, the numbers, and the decision taken.

---

## M5 5.3: Deck measurement gate

**Status: open.** Ranking (5.4 onwards) waits until every row below has a device number and any miss has a written decision.

### How to measure

- **Device:** a 2GB-RAM Android, on a **release** build. Dev builds run the JS thread too slowly to judge.
- **Network:** throttled 3G, e.g. Charles' "3G" preset on the device's proxy, or the router's shaping. Note which one was used.
- **App logging:** build with `EXPO_PUBLIC_MEASURE=1` and read `adb logcat -s ReactNativeJS | grep '\[measure\]'`.
  - `deck.first_card {sinceOpenMs}`: Discover opened to the first card fully on screen (its portfolio laid out and its photo shown). Includes the `deck.preview` fetch.
  - `deck.transition {ms, index}`: a card finished leaving to the next one fully on screen. The next card's photo is already visible the moment the old one leaves (it was the card behind). This times the swap to the full portfolio.
  - `deck.scroll {fps, frames, worstFrameMs, slowFrames, durationMs}`: one line per scroll gesture (drag plus fling) on the focused card, timed on the UI thread. `slowFrames` counts frames slower than 55fps.
- **Swipe to visual response:** not loggable from JS (the gesture runs as a UI-thread worklet). Record a Perfetto or Android Studio system trace during a drag, and read the time from the touch event to the first frame that draws the moved card. Alternatively, check that the UI-thread bar in the Perf Monitor stays green while dragging.
- **Payload:** `pnpm --filter api measure:deck-payload` (API side) reports each card's JSON and its decision-layer image (the lead photo at card size).

### Results

| Metric | Budget | Result | Pass | Notes |
|--------|--------|--------|------|-------|
| First card visible | < 2.5s | _pending device_ | | |
| Card-to-card transition | < 100ms | _pending device_ | | |
| Swipe to visual response | < 16ms | _pending device_ | | |
| Card scroll | ≥ 55fps sustained | _pending device_ | | |
| Decision-layer payload | < 150KB | ~5KB JSON + 450–720KB image | **No** (stopgap) | Re-measure after the move to Cloudflare Images. See below |

**Decision-layer payload (measured 2026-10-29, local seed, 14 cards).** JSON is 3.5–5.4KB per card. The lead image is 454–723KB on 13 of 14 cards, because the stopgap image provider (Supabase Storage, free plan) has no transforms: every variant, `card` included, is the uploaded original (`apps/api/src/media/delivery.ts`). This miss does not depend on the device. It holds on any network, and prefetching five cards ahead downloads about 3MB.

### Decision

**Payload (decided 2026-10-30).** The miss comes from the stopgap image provider, not from the deck, so it does not block 5.4. The budget stays at 150KB. Images will move from Supabase Storage to Cloudflare Images (`CASTLY_IMAGE_PROVIDER=cf_images`), whose `card` variant is resized. When that switch happens:

1. Re-upload or migrate the existing Supabase photos. Rows keep their provider until then.
2. Re-run `pnpm --filter api measure:deck-payload` and replace the payload row above with the new numbers.
3. If the `card` variant is still over budget, decide then between a smaller variant and relaxing the image part of the budget in TECH_SPEC §25.

Options considered and not taken: resizing in the app before upload (doesn't fix existing photos, and Cloudflare Images replaces it), and relaxing the budget now (it would hide a provider limitation behind a spec change).

**Device rows.** Still pending. Misses, if any, follow TECH_SPEC §26.1: relax the named budget, or load the depth layer on explicit expand instead of on scroll.

---

## M5 5.5: Stage 1 candidate query

**Status: passed (2026-10-30).** Budget: p95 under 120ms (TECH_SPEC §7.1) against at least 1,000 live rows.

### How to measure

Run `pnpm --filter api measure:candidates`, or add `-- <n>` for a larger pool. The script needs the admin `DATABASE_URL`.

1. Inside one transaction, it seeds synthetic live talents in Lagos, one category each. Quality scores are rounded to steps of 5, so ties are common.
2. It adds a booker with a role, 300 passes on that role, and 20 blocks.
3. It runs `ANALYZE` on the tables.
4. It times `EXPLAIN ANALYZE` (planning plus execution) on the deck's own `candidateQuery`, 50 runs per scenario.
5. It rolls everything back.

The numbers below are from the local Supabase Postgres on a development Mac. They are database time only, with no network round trip.

### Results

| Pool (live rows) | Scenario | Rows returned | p50 | p95 | Pass |
|---|---|---|---|---|---|
| 1,214 | Vertical default categories | 484 | 1.23ms | 1.81ms | Yes |
| 1,214 | Role category, plus 300 swipes and 20 blocks to exclude | 176 | 0.76ms | 1.13ms | Yes |
| 1,214 | Role, plus city, region and rate filters | 172 | 0.78ms | 1.35ms | Yes |
| 20,014 | Vertical default categories | 500 | 14.36ms | 15.97ms | Yes |
| 20,014 | Role category, plus 300 swipes and 20 blocks to exclude | 500 | 9.43ms | 11.61ms | Yes |
| 20,014 | Role, plus city, region and rate filters | 500 | 9.78ms | 10.99ms | Yes |

**Plan at 20k:** one sequential scan on `talent_search` with the hard filters, then hash anti-joins on swipes and blocks, then a top-N sort (heapsort) for the 500 rows. No index is needed at this size.

If stage 1 later gets close to the budget, the planned fix is TECH_SPEC §26.5: promote frequently filtered attributes onto `talent_search`. A partial index matching the deck's `ORDER BY` is another option.

---

## M5 5.8: `deck.next` latency

**Status: passed (2026-10-31).** Budget: p95 under 400ms.

### How to measure

Run `pnpm --filter api measure:deck-next` against the seeded deck (`seed:deck`). It uses real portfolios and media, so card building costs what it will in use.

1. It creates a throwaway booker. The `other` vertical means no category restriction.
2. It opens 40 sessions and times the service call for each one's first page of 10. That covers the session lock, the refill check (which runs on every call here, since 14 talents minus a page of 10 leaves fewer than 10), the serve writes, and building 10 cards.
3. It restores `talent_exposure_daily` and deletes the booker.

This is local Postgres on a development Mac with no network round trip.

### Results

| Live talents | Calls | p50 | p95 | max | Pass |
|---|---|---|---|---|---|
| 14 | 40 | 23.1ms | 76.6ms | 91.0ms | Yes |

Card building is most of the time: each card loads its record, media, category and playing age separately, and the cards in a page are built in parallel. If production latency approaches the budget, batch those reads across the page.
