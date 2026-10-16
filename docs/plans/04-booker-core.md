# M4 — Booker core

**Goal.** A booker can declare what kind of work they do, then create a project with a role that carries a written brief.

**Depends on.** M1 — auth, modes, taxonomy. Does not depend on M2, but sharing `cities` and `categories` from M1 is required.

**Spec references.** PRD §6.2, §5 (Project, Role). TECH_SPEC §5.5, §5.9 (`vertical_category_weights`), §6 (`booker`, `project`, `role` except publish).

---

## Tasks

### 4.1 Booker schema

`booker_profiles` (vertical, company_name, cac_number nullable, city_id, typical_project_types, `verification_tier` defaulting to phone). `projects`, `roles` (`brief`, `requirements jsonb`, `is_published` default false). `shortlists` and `shortlist_entries` created empty-ready so M5 does not migrate under itself.

**Acceptance.** Migrations apply. A role defaults to unpublished.

### 4.2 Booker signup and vertical profiling

After OTP, if the user enables booker mode: pick vertical (Casting director / Producer / Director / Brand or agency / Event planner / Photographer / Content creator / Other), optional company, location, typical project types.

`booker.getProfile` / `updateProfile`. `submitVerification` is a stub that records intent; the real flow is M7.

**Acceptance.** Device path: enable booker mode → select "Casting director" + Lagos → profile persists. `booker` middleware passes. Server does not trust a `mode=booker` header without the `user_modes` row.

### 4.3 Vertical → category weights

Seed `vertical_category_weights` from PRD §6.2 / §7.2.3: casting director → actors, models, presenters; music-video-adjacent director → dancers, models, stylists; etc. Admin-editable table, no hardcoded map in ranking code.

Minimal admin mutation `admin.verticalWeights` (list + update) behind `admin` middleware, even if the UI is a simple table page.

**Acceptance.** Changing a weight in the database (or admin UI) is what a later deck query will read. No `if (vertical === 'casting_director')` in `packages/core`.

### 4.4 Projects and roles CRUD

`project.list | create | update | archive`. `role.create | update` with name, brief, category, shoot window, rate range, `requirements` jsonb aligned to attribute keys.

A role with a non-empty brief is what M8 will treat as allowing sensitive filters. Store the brief as a real string; empty or whitespace is not a brief.

**Acceptance.** Create project "Bank commercial — March" with role "Lead actress, 25–30, Yoruba-speaking" and a paragraph brief. Archive hides it from the default list. `is_published` cannot be flipped true yet, or if the field exists, `role.publish` is unimplemented/forbidden until M7+M9.

### 4.5 Taxonomy for on-camera attributes

Ensure `attribute_definitions` includes standard and sensitive keys used in briefs (height, age range, languages; complexion, gender, body measurements as sensitive). No prohibited keys.

**Acceptance.** Seed is consistent with PRD §7.3.1 tiers. CI prohibited-attribute guard still passes.

---

## Exit gate

A booker on device declares a vertical and creates a project containing a role with a written brief. Weights for that vertical exist in `vertical_category_weights` and are not hardcoded.

## Deferred

- Deck (M5)
- Professional verification and CAC upload (M7)
- `role.publish` / open board (M9)
- Saved filters (M8)
- Collaborator share links (v1 read-only share is M5/M6 if cheap; otherwise later)

## Risks

| Risk | Decision if it materialises |
|------|------------------------------|
| Vertical list from the PRD does not match how real bookers describe themselves | Keep the enum ops-extendable (`categories`-style table if needed) rather than shipping a code change for every new vertical |
