# M11 — Hardening

**Goal.** Launch-blocking legal and safety items are closed. Every §25 budget is measured on target hardware. Marketplace alerts fire when the product is unhealthy even if servers are green.

**Depends on.** M7 (trust queues), M8 (filters/audit), M9 (open roles), M10 (entitlements/analytics). Practically the last milestone.

**Spec references.** TECH_SPEC §18.3, §20.4, §21, §22.2 fairness simulation, §22.3, §25.

---

## Tasks

### 11.1 Performance pass

Re-measure every §25 metric on the 2GB Android over throttled 3G, including any budgets relaxed at M5. Load-test `deck.next` and candidate SQL.

**Acceptance.** A signed table in `docs/plans/measurements.md` with pass/fail per metric. Failures either get a fix or an explicit spec amendment.

### 11.2 Fairness simulation

Scripted run over synthetic populations. Report Gini of impressions and share of talents receiving ≥1 interest. Assert against PRD §9 target of 40% (tune weights if missed; do not delete the test).

**Acceptance.** CI or a scheduled job prints Gini + share. Share ≥ 40% on the synthetic mix that matches launch-category depth, or a documented exception.

### 11.3 NDPA paths

Lawful-basis record per purpose. Data subject access export. **Account deletion cascade** through media (Cloudflare delete), messages, `talent_search`, interests, matches, uploads, device tokens.

Retention schedule and breach-notification procedure as a written runbook in `docs/` (not only code).

**Acceptance.** Integration test: delete user → no remaining PII in Postgres, no `talent_search` row, Cloudflare refs deleted or queued. Access export contains profile + messages the user sent.

### 11.4 CSAM — launch blocker

PhotoDNA or Thorn Safer on image/video hashes at upload (in addition to Hive/Sightengine). Escalation and preservation procedure. Reporting relationship with NCMEC and Nigerian authorities. Legal review budgeted and dated.

**Acceptance.** A known-positive test hash (vendor-provided) quarantines and opens the escalation path. Runbook exists. This task is **not optional** for first public upload of user photos.

### 11.5 Business alerts

Alert (Sentry, email, or on-call): deck exhaustion rate rising, moderation queue past SLA, verification queue backing up, exposure concentration worsening (top decile share of impressions).

**Acceptance.** Forcing a synthetic exhaustion spike or a stale verification queue produces an alert. Uptime can be green while the alert is firing.

### 11.6 E2E and device lab

Maestro: signup, publish, deck session, match, chat. Playwright: public portfolio, OG, open roles.

Physical Tecno/Infinix 2GB class remains the deck source of truth.

**Acceptance.** CI runs Maestro against a simulator **and** a recorded manual pass exists for the physical device within this milestone.

### 11.7 Feature flags and expand-and-contract

Confirm deck ranking changes can ship behind `feature_flags`. Migrations touching live `config` jsonb still follow expand-and-contract.

**Acceptance.** A dummy flag can hide the exploration injection without a binary ship.

---

## Exit gate

§18.3 CSAM procedure live. §20.4 deletion cascade tested. §25 measured. Business alerts demonstrated. Fairness simulation reporting.

## Deferred

- Phase 2/3 product work
- Dedicated websocket if Realtime later fails (schema unchanged)

## Risks

| Risk | Decision if it materialises |
|------|------------------------------|
| PhotoDNA licensing delay | Do not open public uploads; keep a closed beta of known testers only |
| Deletion cascade misses Cloudflare | Treat as a P0; public launch waits |
| 40% interest share missed on synthetic data | Tune fairness weights; do not ship with the test deleted |
