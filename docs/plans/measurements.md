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
