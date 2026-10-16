# M10 — Monetization

**Goal.** A Paystack subscription that survives a dropped webhook, a single `can(user, feature)` check, and a boost that cannot exceed its cap.

**Depends on.** M2 — portfolio, completeness, media limits. M5 — `boostContribution` already capped at 0 in scoring.

**Spec references.** PRD §7.8. TECH_SPEC §5.9, §6 (`subscription`), §17, §21 (PostHog).

Store billing (Apple/Google IAP) remains unresolved; schema allows `provider ∈ (paystack|apple|google)` but this milestone ships Paystack only.

---

## Tasks

### 10.1 Schema and plans

`subscriptions`, `boosts`. Plans: monthly and annual Pro, NGN. Provider column includes apple/google for later.

**Acceptance.** Migration applies. A user can have one active subscription row.

### 10.2 Entitlement function

`can(user, feature)` in `packages/core` is the **only** place that maps plans to features. Features include: `see_who_viewed_you`, `priority_boost`, `full_studio_templates`, `portfolio_analytics`, `extra_media`, `custom_vanity_slug`, `unlimited_undo`, `remove_public_branding`.

**Never** `extra_open_role_raises` or `boosted_raises` — M9 test remains green.

No feature file checks `plan === 'pro'`.

**Acceptance.** Grep CI or unit: `plan ===` / `plan ==` outside `packages/core` entitlements module fails a lint/test. `can(user, 'extra_open_role_raises')` is always false.

### 10.3 Paystack checkout and recurring

`subscription.getPlans`, `createCheckout`, `status`, `cancel`. Cards, bank transfer, USSD. Authorisation codes for recurring.

**Acceptance.** Test-mode checkout completes and writes `status = active` with `current_period_end`.

### 10.4 Webhooks + nightly reconciliation

Verify signature. Idempotent on Paystack reference. Nightly job compares local subscriptions to Paystack API.

**Acceptance.** Delivering the same webhook twice does not double-extend the period. Dropping the webhook and running reconciliation still marks the subscription active (or lapsed) correctly.

### 10.5 Who viewed / who liked

Pro-only. Backed by `profile_views` and interests. Free users see a teaser, not names.

**Acceptance.** `can` false → names absent. `can` true → list of viewers.

### 10.6 Bounded labelled boost

`boosts` rows. `boostContribution` in M5 scoring becomes non-zero but still capped at a configured fraction of max organic score. UI label on the card for the booker.

**Acceptance.** Property test: boost never exceeds cap. Golden deck: boosted talent rises but does not occupy the entire first page when many boosts exist. Booker sees a label.

### 10.7 Studio and media entitlements

Free: solid subset of templates/themes, media caps. Pro: remaining templates, custom block, longer video, more storage. Custom vanity slug + branding removal on public page.

Undo: free limited, Pro unlimited (M5 used a constant).

**Acceptance.** Free user hitting the media cap is told to upgrade. Pro user publishes a custom vanity slug.

### 10.8 Portfolio analytics

Views, sources, swipe-through, which media performs. Pro.

**Acceptance.** Owner with Pro sees a simple dashboard; free user does not.

### 10.9 PostHog event schema

PRD §9 metrics as a Zod event catalog in `packages/schema`. Clients emit only catalogued names.

**Acceptance.** Unknown event names fail typecheck. Funnel events exist for signups, publish, swipe, match, conversation (≥3 messages), subscribe.

---

## Exit gate

Dropped webhook recovered by reconciliation. `can()` is the only plan interpreter. Boost cap property test passes. M9 unsellable-raises test still passes.

## Deferred

- Apple/Google IAP (blocking for store Pro, not for Paystack web/Android sideload experiments)
- Booker subscriptions and commission (Phase 2–3)
- Price point (set during this milestone after a small willingness-to-pay pass; not a code blocker)

## Risks

| Risk | Decision if it materialises |
|------|------------------------------|
| App Store rejects visibility-as-IAP | Keep Paystack on web; freeze iOS Pro until IAP or move revenue to bookers |
| Boost even at cap wrecks G3 (filters optional) | Lower cap via `ranking_weights`; inspector in M5 will show it |
