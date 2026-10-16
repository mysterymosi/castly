# M8 — Filters

**Goal.** Sensitive filters cannot run without an active briefed role, and every attempt is audited in the same transaction as the query. Hidden rates never disappear from results.

**Depends on.** M5 — `talent_search`, candidate query builder, deck sessions with optional `role_id`.

**Spec references.** PRD §7.3, §7.3.1. TECH_SPEC §6 (`search`), §8, §20.1.

---

## Tasks

### 8.1 Shared query builder

One builder over `talent_search` used by `deck` candidate generation and `search.query` / `search.count`. Filter JSON is the same type in `packages/schema`.

**Acceptance.** A unit test applies the same filter object to both entry points and gets the same talent id set (ordering may differ).

### 8.2 Progressive-disclosure UI

High-value first: category, location + radius, travel, availability, verification, rate range, language, experience.

"All filters": on-camera (age, gender, height, measurements, hair, complexion, tattoos, accents, skills) and crew (discipline, years, equipment, software, genres).

Live result count as filters change.

**Acceptance.** Changing category updates the count without waiting for a full deck restart. Over-constrained filters show a low count, not a spinner forever.

### 8.3 Rate privacy

Talents with `rate_visibility = 'hidden'` appear in an `onRequest` group alongside filtered results. They are not excluded. Ranking must not penalise hidden rates (already true if quality_score ignores it — assert it).

**Acceptance.** Filter `rate_day_min >= 100000` still returns a hidden-rate talent in `onRequest`. Completeness/quality unchanged by hiding.

### 8.4 Sensitive-tier guard + audit

Single function in `packages/core`. Sensitive keys (complexion, ethnicity, body measurements, gender) require an active role with a non-empty brief. On pass, write `sensitive_filter_audit` **in the same transaction** as the query. Soft weight in scoring (M5 `roleSoftMatch`); never a hard SQL `WHERE complexion =`.

Talent-visible: which of their attributes were used to surface them.

**Acceptance.** Integration test: sensitive filter without a brief is rejected and **no** audit row **or** a rejection row — specify reject with no query execution. With a brief, query runs and audit row exists with `booker_id`, `role_id`, attributes, `result_count`. Killing the request between query and audit is impossible because they share a transaction.

Property test: sensitive keys never appear as hard exclusions.

### 8.5 Saved filters

`saved_filters` CRUD, reusable across projects.

**Acceptance.** Save "Lagos actresses 20s Yoruba", apply to a new role.

### 8.6 Live counts performance

Exact `count(*)` under 5,000 estimate; above that, planner estimate via `EXPLAIN (FORMAT JSON)` rendered as "1,000+". Statement timeout 200ms. p95 `search.count` &lt; 300ms.

**Acceptance.** Timeout test does not hang the API. Large unfiltered count returns a bounded string, not a 5s query.

### 8.7 Free-text

`search_tsv` + `websearch_to_tsquery`.

**Acceptance.** Query "Lufodo" returns talents with that string in bio/credits.

### 8.8 Admin sensitive-filter audit

List by booker and role. Flag outliers (same complexion filter across unrelated projects).

Sensitive attributes never in aggregate marketplace dashboards.

**Acceptance.** Ops can open a booker's audit history. Health dashboard does not chart complexion.

---

## Exit gate

Sensitive filters unusable without an active briefed role; every allowed use writes an audit row in the same transaction. Hidden rates remain visible as on-request. Count endpoint meets timeout/budget.

## Deferred

- Natural-language search (Phase 2)
- Legal sign-off on tier assignments (process; code stays data-driven)

## Risks

| Risk | Decision if it materialises |
|------|------------------------------|
| `count(*)` still slow | Rely on estimates earlier; do not add a search engine in v1 |
| Bookers confused that complexion is disabled until they write a brief | Copy in the filter sheet explaining why; do not loosen the guard |
