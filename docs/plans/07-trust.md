# M7 — Trust

**Goal.** An unverified booker can browse and pass but cannot express interest. Quarantined media never reaches a deck. Ops can clear verification and moderation queues.

**Depends on.** M4 — booker profiles. M6 — interests, messages (gate sits on right-swipe and `message.send`). M2 — `media_assets` already enqueue a moderation job.

**Spec references.** PRD §7.5–§7.6.1, §7.9. TECH_SPEC §5.8, §16, §18.1–§18.2, §18.4, §19.

CSAM hash-matching (TECH_SPEC §18.3) is launch-blocking but implemented in **M11** so M7 can ship the rest of the trust stack; do not treat M7 as "safe for public upload of strangers' photos" until M11 is done.

---

## Tasks

### 7.1 Verification tables and tiers

`verifications`: tier `phone | id | professional`, provider refs and outcomes only — **never raw ID images or selfies**.

Phone tier is created at OTP (M1). Professional: CAC lookup **or** work-email domain **or** manual production-history review. ID (talent): Smile ID document + liveness, optional.

**Acceptance.** A verification row stores `provider_ref` and status, not a document blob. Listing the table in a debug query shows no image URLs to identity documents.

### 7.2 `verifiedBooker` middleware (real)

Replace the M1 stub. Professional verification `status = approved` required for: right-swipe (`deck.swipe` direction interest), `message.send`, `role.publish`.

Browse, left-swipe (pass), save-for-later, and filters remain allowed.

UI: right-swipe and Interested button prompt to verify instead of recording interest.

**Acceptance.** Integration tests: unverified booker `deck.swipe` interest fails; pass succeeds; `message.send` fails. Verified booker succeeds. Gate is in middleware, not only in the UI.

### 7.3 Booker professional verification flow

Mobile + admin queue. Booker-professional queue is **prioritised** (activation path).

Name-mismatch retries: up to 3 with copy, then manual.

Never charge for any tier.

**Acceptance.** Admin can approve a CAC or production-history submission; the booker can then swipe right. Median queue SLA timer is visible in admin.

### 7.4 Talent ID verification (optional)

Smile ID RN SDK. Modest ranking lift on `quality_score` / badge only. Three attempts then manual.

**Acceptance.** Optional path completes with a badge. Declining ID verification does not block publish.

### 7.5 Media moderation

On `media_assets` → `ready`, job calls Hive or Sightengine. Above-threshold nudity/violence → `quarantined` + `moderation_events`. Deck, public page, and studio preview of others never serve quarantined ids.

**Acceptance.** A fixture image that fails the vendor (or a stubbed fail in test) never appears in `deck.next` or public HTML.

### 7.6 Reporting, blocks, conduct

Report from every surface with PRD taxonomy (fee request, harassment, sexual solicitation, fake profile, impersonation, no-show). Fee-request and sexual-solicitation auto-escalate to top of queue. SLA timer.

`blocks` both directions. `conduct_reports` private, feed `responsiveness_score` later (M2 job already has the column).

**Acceptance.** A fee-request report is first in the admin queue. Blocking hides the other party from deck and chat.

### 7.7 Safety centre and anti-fraud interstitial

Safety centre in onboarding, settings, and as a warning interstitial. Copy: no fees, meet in public, bring someone.

First message **to a talent from an unverified booker** cannot happen after 7.2; keep the interstitial for first message from a booker who is verified-but-new **or** if product still allows any residual unverified path. PRD: first message from an unverified booker. Implement the screen so it can show whenever the sender is not professionally verified — defends against future gate bugs.

**Acceptance.** Talent sees the warning with a one-tap report before they reply to a non-professionally-verified sender. If 7.2 makes that sender impossible, still ship the screen and trigger it from a test flag.

### 7.8 Admin queues

Verification (professional first), moderation, reports, with action logging. Taxonomy including attribute tier assignment.

**Acceptance.** Ops can approve/reject verification, quarantine/restore media, and resolve a report without SQL.

---

## Exit gate

Unverified booker: browse + pass only. Verified booker: interest + chat. Quarantined asset absent from deck and public page. Admin queues usable.

## Deferred

- PhotoDNA / Thorn Safer / NCMEC procedure (M11) — launch blocker
- NDPA deletion cascade (M11)
- Guardian-managed minors (Phase 2)
- Public reliability scores (never in v1)

## Risks

| Risk | Decision if it materialises |
|------|------------------------------|
| Smile ID quotes blow the budget | Keep professional verification (bookers, small N); delay talent ID or use a cheaper document-only path |
| Hive/Sightengine false positives | Quarantine still happens; ops restore path must exist before launch of 7.5 |
