# M2b — Studio content

**Goal.** A talent can fill every core section from the studio: categories, profile basics, credits, languages and accents, rates, availability and attributes. What they enter reaches the portfolio, the deck card and `talent_search`, so M8's filters have data to match.

**Depends on.** M2 — talent tables, section registry, `serializeTalent`, `talent_search` triggers, studio hub. M5 — role decks (category scope).

**Spec references.** PRD §6.1 steps 3 and 5, §7.1.1, §7.1.3, §7.3. TECH_SPEC §5.3–§5.4, §5.10, §7.5, §8.

**Why this exists.** M2.4 shipped the studio frame (quick start, add/hide/reorder sections, templates, previews) but no content editors. The tables and renderers exist; nothing writes to them except `seed-deck`. So a talent can add a Credits section that can never show anything, and a talent created in the app has no category, which keeps them out of every role deck that has one. M8 assumes this data exists.

---

## Tasks

### 2b.0 Categories and canvas

**Status:** Done.
- Categories: `talent.categories.set` (1–3 active categories, primary first). Quick start has a "What do you do?" step, and the studio has a "What you do" screen. Studio state carries `categories` and `categoryIds`. Tests: `apps/api/src/talent/categories.integration.test.ts`.
- Canvas: `talent.studio.setCanvas`, `canvasSpec` in `packages/schema/src/canvas.ts`, and `decision.canvasMediaId` on deck cards. Tests: `apps/api/src/talent/canvas.integration.test.ts`.

**Open:** `completeQuickStart.categoryIds` is optional so older builds still finish. It becomes required in 2b.9.

### 2b.1 Section editors

**Status:** Done. Routes: `studio/edit/[type]` and `studio/credit`. The empty-section rule is `sectionHasContent` / `readRenderableSections` in `packages/schema/src/portfolio/content.ts`, shared by the web page, the deck card and the studio preview. Hero opens the profile editor. Saving a list's first row adds its section if the talent has none; a section the talent hid stays hidden.

Tapping a section row in the studio hub opens that section's editor; the up/down buttons stay. One route per editable type under `studio/edit/[type]`, each saving through its own procedure. A list section with no content shows an empty state in the studio preview ("Add your first credit") and is left out of the public page and the deck card.

**Acceptance.** Every core section type with content (`about`, `credits`, `attributes`, `skills`, `languages`, `rates`, `availability`) opens an editor from the hub. An empty Credits section renders nothing on the public page or a deck card.

### 2b.2 Profile basics

**Status:** Done.

After quick start, the talent can edit display name, headline, bio, city, willing to travel and open to relocate. `updateProfile` gains `headline`, `willingToTravel` and `openToRelocate`. Skills become editable after quick start (`skills.set`), with an optional proficiency (`learning | competent | proficient | expert`) per skill.

**Acceptance.** Edits show in the preview without reopening the studio. Changing city updates `talent_search.city_id` and `country`.

### 2b.3 Credits

**Status:** Done, with two changes. Reordering uses up and down arrows, as the section list does; drag-to-reorder needs a new dependency and was left out. Editing a verified credit's title, role, company or year clears `verifiedAt`.

`talent.credits.create | update | delete | reorder`. Fields: title (required), role name, production company, year, type (film, TV, commercial, music video, theatre, campaign), link. At most one credit is the signature; marking a new one unmarks the old. `verifiedAt` cannot be written by the talent.

Editor: a list with add, edit, delete and drag-to-reorder, plus a star for the signature credit.

**Acceptance.** Integration test: create, reorder and delete round-trip through `serializeTalent`. A second signature unmarks the first. A talent cannot set `verifiedAt`. `talent_search.credit_count` and the deck's `signatureCredit` follow the edits.

### 2b.4 Languages and accents

**Status:** Done.

`talent.languages.set([{ languageId, fluency }])` with fluency `basic | conversational | fluent | native`, and `talent.accents.set([accentId])`. Both replace the whole list, like skills. The editor picks from the active taxonomy and sets fluency per language.

**Acceptance.** `talent_search.language_ids` and `accent_ids` update through the existing triggers. A retired language is rejected. The portfolio's Languages section shows fluency, and shows accents when `showAccents` is on.

### 2b.5 Rates

**Status:** Done.

`talent.rates.set([{ kind, amountMin, amountMax, currency, negotiable }])` for `day | half_day | project`, plus `rateVisibility` (`public | verified_bookers | hidden`) on `updateProfile`. "On request" means no amounts with `negotiable` on. `amountMin` must not exceed `amountMax`. Currency defaults to NGN.

The editor explains each visibility option in plain words and states that hiding rates never lowers ranking (PRD §7.3).

**Acceptance.** Integration test: a hidden-rate talent's rates are absent for a non-owner viewer and `talent_search.rate_day_min` is null. Changing visibility does not change `completeness_score` or `quality_score`.

### 2b.6 Availability

**Status:** Done. The editor saves all 12 months, so a saved strip is what makes the section show. The projection is now an M8.2 task (see `08-filters.md`).

`talent.availability.set([{ month: "YYYY-MM", status }])` covering the current month and the next 11; months left unset count as available. The editor is a 12-month strip that cycles available → partial → booked on tap. Past months are dropped on write.

**Acceptance.** The portfolio's Availability section shows `horizonMonths` months from today. A month before the current one is rejected.

**Note.** `talent_search` has no availability projection. M8.2's availability filter needs one: add a trigger and column here, or record it as an M8 task when 2b.6 lands.

### 2b.7 Attributes

**Status:** Done. Applicability is `attributeAppliesTo` in `packages/schema`, which also matches a category's ancestors. Option values display humanised ("Dark brown").

An editor built from `attribute_definitions`. It shows definitions whose `applies_to_category_ids` overlap the talent's categories (or that apply to every category), and renders by `data_type`: options become a picker, numbers a unit-labelled field, booleans a switch. Saves through `attributes.set`; clearing a value deletes the row.

- **Sensitive tier:** grouped separately under a short explanation that these values are used only when a booker filters a role with a written brief, and that they never affect completeness or ranking (PRD §7.3.1).
- **Visibility:** the per-attribute `is_visible` toggle is settable. A hidden attribute is never serialized for a non-owner.
- **Replaces** the studio's dev-only ethnicity button.

**Acceptance.** Integration test: filling a sensitive attribute changes neither `completeness_score` nor `quality_score`. A hidden attribute is absent for a non-owner. A model sees height and measurements; a makeup artist does not.

### 2b.8 Completeness counts content, not empty sections

**Status:** Done. A visible showreel scores only with a video in it. Content writes recompute completeness, and for a live talent whose score changes, the quality and search score jobs as well.

Today a section scores as soon as it is visible (`computeCompleteness` takes `visibleSectionTypes`), so an empty Credits section earns points. Pass counts instead (credits, languages, rates set, months set, standard attributes filled) and score a section only when it has content. Recompute on every content write, as section writes do now. The meter names the next most valuable addition (PRD §6.1 step 6).

**Acceptance.** Adding an empty Credits section leaves the score unchanged; adding the first credit raises it. Sensitive attributes still contribute nothing.

### 2b.9 Category required

**Status:** Partly done. Publishing needs a category (`publishBlockers` on the completeness result) and the hub and meter say so. `completeQuickStart.categoryIds` stays optional: the repo has no minimum-app-version mechanism yet to gate it on.

Make `completeQuickStart.categoryIds` required once the build with the category step is the minimum supported app version. Publishing needs at least one category (`publish_not_ready` names it). Before enforcing, list talents without a category and have each pick one; no automatic backfill.

**Acceptance.** Publishing without a category fails with a message naming the missing step. The studio hub's "What you do" row is the way to fix it.

### 2b.10 Data saver one tap from the deck

**Status:** Done: a leaf button in the deck header (`deck-data-saver`), next to undo.

PRD §7.1.3 requires data saver to be "reachable in one tap from the deck" and "never buried in settings". The UI pass moved it into the deck settings sheet (two taps). Put a one-tap control back on the deck header; the sheet can keep a copy.

**Acceptance.** From a focused deck card, one tap turns data saver on, and the canvas loop stops.

### 2b.11 Photos replace the gallery

**Status:** Done. The gallery section is gone. A talent has up to six photos (`talent_photos`, Main first), arranged in a studio grid: press and hold to drag, × to remove, + to add. Main leads the deck card (or sits under the canvas) and is the hero image and link preview on the web; the other photos are spread evenly between the portfolio's sections by `layoutPortfolio` in `packages/schema`, the same on the card, the studio preview and the public page (parity-tested). The talent orders the photos, not where they land. Migration `0014_talent_photos` moved each talent's card lead, hero image and gallery photos into the list and deleted the gallery sections. The card's tap-through of several lead photos is gone. Tests: `apps/api/src/talent/photos.integration.test.ts`.

Follow-ups, done: × asks Replace / Remove (and confirms the remove); a replacement keeps its slot (`talent.photos.replace`). New photos go through a 4:5 crop screen (`studio/crop`) before upload; slot 1 marks the part that fills the card's first screen. The studio preview is the real deck card, served as an unverified booker sees it (`talent.studio.previewCard`); the separate decision-card tab is gone, and the hub marks empty sections instead. Media nothing uses is deleted (provider file, then row) after a photo or canvas is removed or replaced (`apps/api/src/media/cleanup.ts`), and `pnpm --filter api media:cleanup` sweeps uploads left unattached for 24 hours. Quick start's photo step does not crop yet.

---

## Exit gate

On device, a talent created through the app picks categories in quick start, fills credits, languages, rates (hidden), availability and three attributes from the studio, and publishes. A booker's role deck in that talent's category shows them, with the signature credit on the card and rates hidden. `talent_search` reflects every field. Completeness rose with each filled section and did not move when a sensitive attribute was filled.

## Deferred

- Audio, training, affiliations, press, testimonials, social links and custom blocks (M2 deferred list; tables may exist)
- Themes and per-block display styles: hero styles, gallery grid/masonry/carousel (PRD §7.1.2)
- Self-rated proficiency shown in ranking or filters (M8)
- Credit verification by bookers (M7)
- Sensitive-attribute filters and their audit (M8)

## Risks

| Risk | Decision if it materialises |
| --- | --- |
| Per-section editors sprawl into one bespoke screen each | Share one list-editor shell (add, edit, delete, reorder) for credits now, and later for training, press and testimonials |
| Attribute definitions grow faster than the editor's renderers | Render by `data_type` only; a new definition never needs app code |
| Making categories required strands talents on old builds | Enforce only after the minimum-version bump; until then the hub warning carries it |
| Completeness rescoring shifts live talents' scores | Run it once on deploy and note the change in the release; quality and search jobs rerun with it |
