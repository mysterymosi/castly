# M3 — Public portfolios

**Goal.** A live talent has a shareable web page whose WhatsApp preview is correct. This is the organic growth loop.

**Depends on.** M2 — published portfolios, section schema, media variants including `og`, `serializeTalent` for public viewers (owner vs stranger).

**Spec references.** PRD §7.1.2 public page. TECH_SPEC §3 (Next.js), §9.2, §22.1 (Playwright, renderer parity).

---

## Tasks

### 3.1 Web section renderers

**Status:** Done — `packages/portfolio-web` (`webSectionRegistry`, `PortfolioSections`, `sectionsFromDto`, `mediaMetaFromStatus`; fixtures at `@workspace/portfolio-web/fixtures`). Renderers are hook-free Server Components; media elements are injectable like native. List sections (credits, attributes, skills, languages, rates, availability) read rows from a `PortfolioContent` prop because section configs carry display options only — the page loader (3.2) and serializer (3.5) must supply it. Sections with nothing to show render nothing. CI runs `pnpm --filter @workspace/portfolio-web test`.

`packages/portfolio-web`: stacked React renderers for every shipped section type, consuming the same validated + forward-migrated section list as native.

**Acceptance.** A fixture portfolio renders all core types without client-side fetch of section JSON (RSC / server render).

### 3.2 Vanity URL and SSR page

`apps/web` route `/{slug}` (and `castly.app/{slug}` in prod). 404 for draft/suspended. Server-render the section list. Canonical URL. `robots.txt` and sitemap of live slugs.

**Acceptance.** `curl` of a live slug returns 200 HTML containing the talent's display name and headline. A draft slug returns 404.

### 3.3 OG and Twitter tags

`og:title`, `og:description`, `og:image` using the `og` variant, `og:url`. Twitter card `summary_large_image`.

**Acceptance.** Playwright (or opengraph.xyz plus a recorded WhatsApp screenshot) shows title, description, and image. Pasting the link into WhatsApp produces a rich preview — this is the exit-gate check, not optional.

### 3.4 Renderer parity snapshots

Same fixture portfolios through native and web extractors. Compare **semantic content** (section types, text, media ids, order), not pixels.

**Acceptance.** CI fails if web drops a credit that native shows, or reorders sections. Presentation differences are allowed.

### 3.5 Public serialize rules

Public viewer: no hidden rates, no unpublished sections, no quarantined media (quarantine is a no-op until M7; still filter `status = 'ready'`).

**Acceptance.** A portfolio with `rate_visibility = 'hidden'` omits the rates block on the public page and includes it when the owner is logged in on mobile.

---

## Exit gate

A live portfolio URL pasted into WhatsApp shows a correct rich preview. Direct visit shows the stacked portfolio. Drafts are not reachable. Parity tests are in CI.

## Deferred

- Custom vanity URL as a Pro entitlement (M10)
- Branding removal as Pro (M10)
- Open-roles listing on web (M9)
- Indexing beyond sitemap (Search Console) — ops, not build

## Risks

| Risk | Decision if it materialises |
|------|------------------------------|
| WhatsApp caches a bad OG image during testing | Use the Facebook sharing debugger; add a cache-buster query only in preview, never in canonical URLs |
