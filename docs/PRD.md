# Castly — Product Requirements Document

**Version:** 0.2 (open questions resolved)
**Date:** 16 September 2026
**Status:** Awaiting sign-off before technical specification
**Product name:** Castly (working title)

---

## 1. Summary

Castly is a mobile-first, swipe-based discovery app for the entertainment industry, starting in Nigeria and expanding across Africa.

Talents build rich, self-designed portfolios — closer to a vendor storefront than a CV. Bookers (casting directors, producers, brand managers, event planners, music video directors, agencies) tell us what kind of work they do, get a curated deck of relevant talent, swipe through it, and unlock a conversation when interest is mutual.

The core bet: **discovery in Nigerian entertainment is currently broken and personal — it runs on WhatsApp groups, Instagram DMs, and who-knows-who. Castly turns it into a fast, filterable, portfolio-backed feed.**

---

## 2. Problem

### 2.1 For bookers

Finding talent today means:

- Posting a brief in WhatsApp groups and drowning in unstructured replies — hundreds of photos, voice notes, and "sir please consider me" messages with no way to compare candidates.
- Scrolling Instagram, where the grid is optimised for aesthetics, not for the information a booker needs (height, age range, languages spoken, accents, union status, availability, rate, location, showreel).
- Relying on a small circle of agents and repeat talent, which is fast but shallow — the same faces recur across productions, and new talent is invisible.
- No reliable way to verify that a portfolio is real, current, or that the person will show up.

The result is slow casting cycles, narrow talent pools, and high no-show risk.

### 2.2 For talents

- Visibility is gatekept. Without an agent or an existing relationship, a skilled actor, dancer, or cinematographer has almost no path to a casting director.
- Instagram is the de facto portfolio, but it is a poor one — it can't express range, credits, skills, physical attributes, or rates in a structured way, and follower count becomes a proxy for talent.
- The opportunities that do circulate are noisy and frequently fraudulent — fake auditions, "pay a fee to be considered," and exploitative approaches.
- Effort is not compounding. A talent who works hard on their craft has nothing durable to show for it online except a scattered set of posts.

### 2.3 Why now

- Nollywood is the second-largest film industry in the world by output, and streaming investment (Netflix, Prime Video, Showmax) has raised production volume and quality expectations.
- Afrobeats' global rise has pulled up an entire adjacent economy: music videos, dancers, choreographers, stylists, directors, editors.
- Brands and agencies are producing far more content than before, with shorter timelines — they need to cast fast and repeatedly.
- Smartphone penetration and short-form video have produced a huge cohort of self-taught, camera-ready talent (skit makers, dancers, content creators) with no formal route into professional production.

---

## 3. Goals and non-goals

### 3.1 Goals (v1)

| #   | Goal                                                 | Success looks like                                                                           |
| --- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| G1  | Make talent discovery fast and enjoyable for bookers | A booker can go from signup to a shortlist of 10 relevant talents in under 10 minutes        |
| G2  | Give every talent a portfolio worth sharing          | Talents voluntarily use their Castly link as their primary portfolio, including off-platform |
| G3  | Curate well enough that filters are optional         | ≥60% of a new booker's first session happens on the default deck, before touching filters    |
| G4  | Protect both sides from spam and fraud               | Mutual-interest gating on messaging; verified badges; zero tolerance for pay-to-audition     |
| G5  | Prove the core loop                                  | A measurable rate of matches converting to real conversations, and self-reported bookings    |

### 3.2 Non-goals (v1)

- **Payments, escrow, and contracts.** The deal happens off-platform in v1. Revisit in Phase 3.
- **Structured booking workflow** (date holds, rate negotiation, call sheets). Phase 2.
- **Agency and management tooling** (roster management, commission splits). Phase 2–3.
- **Full desktop web app for bookers.** v1 web presence is public portfolio pages and marketing only.
- **Talent-side job board with applications.** Talents can browse published roles and raise a hand (§7.4), but there is no application inbox, no cover letters, and no talent-initiated messaging. Discovery stays booker-initiated.
- **Social features** — followers, feeds, likes, comments. Castly is a professional tool, not a social network.
- **Training, courses, or community content.**

### 3.3 Explicitly out of scope forever

- Anything that charges talent to be considered for a specific opportunity.
- Ranking or sorting talent by follower count or physical attractiveness as a primary signal.

---

## 4. Users

### 4.1 Roles

| Role                 | Description                                                                                                                                                                                                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Talent**           | Anyone who supplies skill, craft, or presence to entertainment production. Includes on-camera talent (actors, models, dancers, presenters, extras) and crew/creative talent (cinematographers, editors, makeup artists, stylists, producers, set designers, sound engineers, choreographers). |
| **Booker**           | Anyone who needs talent. Includes casting directors, film/TV producers, directors, music video directors, brand and marketing managers, ad agency producers, event planners, photographers, and content studios.                                                                              |
| **Agency / Manager** | Represents multiple talents. Welcome in v1 as a **supply channel**, with delegated access to profiles the talent owns — never as the account owner (see §11). No agency tooling or ranking advantage until Phase 2.                                                                          |
| **Admin / Ops**      | Castly internal — verification review, moderation, category management, curation tuning.                                                                                                                                                                                                      |

A single person can hold both Talent and Booker roles on one account — a working cinematographer may also hire a gaffer. **Role is a mode, not an identity.**

### 4.2 Personas

**Amaka — Casting Director, Lagos (Booker)**
Casts for two Nollywood features and a handful of commercials at any time. Gets 400+ WhatsApp submissions per role. Needs: filter by age range, ethnicity/look, language and accent (Yoruba, Igbo, Hausa, Pidgin, "neutral"), acting experience, location, and availability. Cares about showreels above all else. Works on deadline.

**Tunde — Aspiring Actor, Ibadan (Talent)**
Three student film credits and a theatre background. Has 800 Instagram followers. Cannot get seen. Has a phone, an entry-level Android, and limited data. Needs: a credible portfolio he can build from his phone, and any path to a real casting director.

**Chidera — Brand Manager, FMCG (Booker)**
Needs four "relatable, aspirational, ages 24–32" faces for a campaign shoot in two weeks, plus a stylist and a makeup artist. Doesn't know casting jargon. Needs guardrails and good defaults, not a professional casting tool.

**Kelechi — Music Video Director (Booker + Talent)**
Books dancers, models, and crew for every shoot. Also gets booked himself by labels. Needs to switch modes easily and keeps reusable shortlists of people he likes working with.

**Blessing — Professional Dancer & Choreographer, Lagos (Talent)**
Works steadily but through word of mouth. Needs to show movement, not photos — video-first portfolio, credits with recognisable artists, and rate clarity so she stops being lowballed.

---

## 5. Core concepts

| Concept       | Definition                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Portfolio** | A talent's public, self-designed profile page. Composed of content blocks, with a selectable layout and theme. Has a shareable public URL. |
| **Card**      | The condensed, swipeable representation of a talent inside a deck. Auto-generated from the portfolio; talent controls which media leads.   |
| **Deck**      | The ordered set of cards a booker swipes through in a session. Curated, filterable, and scoped to a project when one is active.            |
| **Project**   | A booker's container for a casting need — e.g. "Bank commercial — March." Holds one or more roles, and the shortlists built for them.      |
| **Role**      | A specific need inside a project — e.g. "Lead actress, 25–30, Yoruba-speaking." Filters and shortlists attach to roles.                    |
| **Shortlist** | The collection of talents a booker swiped right on, per role. The real output of a swipe session.                                          |
| **Interest**  | A booker's right-swipe. Sent to the talent as a notification.                                                                              |
| **Match**     | Mutual interest. Talent accepts a booker's interest (or has auto-accept on), which unlocks chat.                                           |
| **Pass**      | A left-swipe. Suppresses the card for a period, scoped to the role — never a permanent global block.                                       |
| **Open role** | A role a booker has chosen to publish to the browsable board. Opt-in per role, default off.                                               |
| **Raised hand** | A talent signalling interest in an open role. Inserts them into that role's deck with a flag; it is not a message or an application.     |

---

## 6. Key journeys

### 6.1 Talent: signup to live portfolio

1. Download app, sign up with phone number (OTP) — phone-first, because email is secondary for much of the market. Email/Google/Apple optional.
2. Choose primary role: **"I'm looking for work"** / **"I'm looking for talent"** / **"Both."**
3. Pick primary talent category (e.g. Actor) and up to two secondary categories (e.g. Voice Artist, Model). Category drives which portfolio blocks are suggested.
4. **Guided quick-start** — the minimum viable portfolio in under 5 minutes: name, location, 3 photos, one line about yourself, top 3 skills. The card can go live at this point.
5. **Portfolio studio** — the open-ended builder. Add blocks, reorder them, pick a layout and theme, upload showreel, add credits, set rate range and availability.
6. **Completeness meter** shows what's missing and what each addition does for visibility (e.g. "Talents with a showreel get 3× more interest"). This is the primary driver of portfolio depth.
7. Optional verification: ID check, and for crew, portfolio review.
8. Go live. Get a shareable link (`castly.app/tunde-adeyemi`).
9. Browse open roles and raise a hand on anything that fits (§7.4) — the talent-side reason to return each week.

### 6.2 Booker: signup to shortlist

1. Sign up (phone or email).
2. Declare identity: **what kind of work do you do?** — Casting director / Producer / Director / Brand or agency / Event planner / Photographer / Content creator / Other. Plus: company (optional), location, and typical project types.
3. **This is the cold-start signal.** A casting director's default deck leads with actors and models; a music video director's leads with dancers, models, and stylists; an event planner's leads with MCs, DJs, hype men, and performers; a brand manager's leads with commercial-look models and presenters.
4. Optionally create a project and role now, or skip straight to browsing. Bookers who skip get a general deck in their vertical.
5. Swipe. Right-swipe adds to shortlist and sends interest. Left-swipe passes. Scroll down inside a card for the full portfolio without leaving the deck.
6. Review shortlist, compare side by side, message matched talents.
7. Invite a collaborator to view or comment on the shortlist (Phase 2 for full collaboration; v1 allows a read-only share link).

### 6.3 The match loop

1. Booker right-swipes Tunde → interest recorded, Tunde notified ("A casting director is interested in you for a feature film role").
2. Tunde sees who it is, what the project is (if the booker attached one), and the booker's verification status.
3. Tunde accepts or passes. Talents can enable **auto-accept** so verified bookers can message immediately — most talents will.
4. On acceptance: match created, chat unlocked, both notified.
5. Chat supports text, images, video, and voice notes. Contact details can be exchanged; Castly does not block off-platform movement in v1.

**Why mutual opt-in:** it protects talent from unsolicited approaches, gives the talent side a reason to open the app, and creates a natural quality filter. Auto-accept keeps it from throttling supply.

---

## 7. Features

### 7.1 The portfolio studio (talent)

This is the product's defensible surface. The requirement is a **storefront builder, not a profile form** — a talent should be able to express range, taste, and personality, and the output should be good enough to use as their primary professional link.

#### 7.1.1 Block library

Talents compose their portfolio from blocks. Block availability and defaults are driven by talent category.

| Block                     | Description                                                                                                                                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hero**                  | Header photo or video, name, headline, location, primary categories, verification badges. Multiple hero styles (full-bleed image, video loop, split, minimal).                                                                               |
| **About**                 | Long-form bio, with optional voice-note intro — valuable for voice artists, presenters, and low-literacy accessibility.                                                                                                                      |
| **Gallery**               | Photo sets with captions. Supports grouping (e.g. "Headshots", "Editorial", "Commercial"). Multiple display styles: grid, masonry, carousel, full-bleed slideshow.                                                                           |
| **Showreel / Video**      | Primary showreel plus additional clips. Native upload and external embed (YouTube, Vimeo, Instagram).                                                                                                                                        |
| **Audio**                 | Tracks, voice demos, accent reels, mix samples. Essential for musicians, voice artists, sound engineers.                                                                                                                                     |
| **Credits**               | Structured work history: title, role, production company, year, type (film, TV, commercial, music video, theatre, campaign), link. The closest thing to a verifiable CV.                                                                     |
| **Stats / Attributes**    | Category-specific structured data. Actors and models: height, bust/waist/hips, dress/shoe size, hair, eye colour, visible tattoos, age range playable. Crew: equipment owned, software, years of experience. **This is what filters query.** |
| **Skills**                | Tagged skills with self-rated proficiency — e.g. stage combat, horse riding, swimming, specific dance styles, instruments, driving.                                                                                                          |
| **Languages & accents**   | Language plus fluency, and accents performable (Yoruba, Igbo, Hausa, Pidgin, British, American, South African, Francophone). A genuinely differentiating filter for African casting.                                                         |
| **Rates**                 | Day rate, half-day, and per-project ranges; "negotiable" and "on request" also allowed. **Visibility is a per-talent toggle** — show publicly, show only to verified bookers, or hide and accept enquiries. Hiding carries no ranking penalty (see §7.3).                                  |
| **Availability**          | Calendar-light: available / partially available / booked, by month, plus base location and willingness to travel or relocate.                                                                                                                |
| **Training & education**  | Schools, workshops, coaches, certifications.                                                                                                                                                                                                 |
| **Unions & affiliations** | AGN, DGN, and equivalents.                                                                                                                                                                                                                   |
| **Press & features**      | Articles, interviews, mentions.                                                                                                                                                                                                              |
| **Testimonials**          | Quotes from past collaborators. Phase 2: verified testimonials from Castly bookers who worked with the talent.                                                                                                                               |
| **Social proof**          | Linked social accounts and follower counts. Displayed, deliberately de-emphasised in ranking.                                                                                                                                                |
| **Custom block**          | Free-form title, rich text, and media, for anything the library doesn't cover.                                                                                                                                                               |

#### 7.1.2 Layout and appearance

- **Templates** — a set of designed starting points tuned per category (e.g. "Editorial" for models, "Reel-first" for actors, "Case study" for crew and creatives). Choosing a template sets block order, layout, and theme in one step.
- **Block reordering** — drag to reorder; show/hide without deleting.
- **Themes** — curated palettes, type pairings, corner radius, and density. Curated sets rather than a free-for-all, so that every portfolio looks credible. A modest custom accent colour is allowed.
- **Card configuration** — the talent picks which media and which three facts lead on their swipe card. The card is derived from the portfolio, but explicitly art-directable, because it's what wins the swipe.
- **Live preview** — see the portfolio and the card as a booker sees them, before publishing.
- **Public page** — responsive web page at a vanity URL, with rich link previews for WhatsApp and Instagram sharing. This doubles as the organic growth loop: talents share their own portfolios.

#### 7.1.3 Constraints to respect

- Must be fully usable on an entry-level Android phone over a patchy connection.
- Uploads must be resumable, compressed client-side, and queued so the app works offline and syncs later.
- **Data-saver mode** — replaces video autoplay with poster frames and tap-to-play, and serves lower-resolution media. Off by default, but the app offers it proactively when it detects a metered or slow connection, and it is reachable in one tap from the deck. Data cost is a real barrier for the talent side, so this must never be buried in settings.
- Card-width rendering is a hard constraint on every block, because the deck renders full portfolios inline (§7.2.1).

### 7.2 The swipe deck (booker)

#### 7.2.1 The card

**The card is the whole portfolio, not a teaser for it.** There is no separate profile screen inside the deck. A card scrolls vertically through the talent's full portfolio, and the booker can swipe left or right from any scroll position without losing their place in the deck. This removes the navigate-in, navigate-back detour that would otherwise break a 50-card session, and it means depth costs the booker nothing when they don't want it.

The card has two layers:

**The decision layer** — what's visible before any scrolling, sized to support a 2–3 second judgement:

- Lead media (photo or muted video) with 3–5 swipeable media items.
- Name, primary category, location, age range (for on-camera talent).
- Three talent-selected highlight facts (e.g. "Speaks fluent Yoruba", "3 Netflix credits", "Trained: Lufodo Academy").
- Verification badge and a "recently active" indicator.
- Credit count and a one-line signature credit.
- A scroll affordance, so it's obvious there is more below.

**The depth layer** — the full portfolio, scrolling inline below: showreel, galleries, credits, attributes, skills, languages, rates, availability, training. Ordered by the talent in the portfolio studio (§7.1.2).

**Actions**, persistently docked so they stay reachable at any scroll depth: **Pass** (left), **Interested** (right), **Save for later**, **Share**.

**Sections are the unit of composition.** A portfolio is an ordered list of sections, not a continuous document. Mobile renders that list as a virtualised vertical scroll inside the card; the public web page (§7.1.2) renders the same list as a stacked page. One schema, two renderers, and the ordering a talent sets in the studio holds on both.

**Portfolio length is capped** — a maximum of 12 sections, with per-section media limits. This is a deck-review constraint, not a storage one: uncapped portfolios make prefetch cost unpredictable and let a single card absorb a whole session.

**Defaults differ by category.** On-camera cards open at the decision layer, because look and presence carry the first judgement. **Crew and creative cards open partially expanded**, leading with work samples and credits rather than a headshot — hiring a cinematographer is a portfolio decision, and their face is close to irrelevant to it. Same deck mechanics, different opening state.

**Media autoplay is on by default**, muted, one video at a time (the card in focus only). Data-saver mode (§7.1.3) switches to poster frames with tap-to-play, and the app prompts to enable it automatically when it detects a metered or slow connection.

> **Constraint for the technical spec.** A vertically scrolling full portfolio inside a horizontally swipeable card is the main performance risk in the product, and the following are requirements rather than optimisations:
>
> - **Only the focused card mounts its depth layer.** Adjacent cards in the deck render the decision layer alone, from a cheap poster image. Deck prefetch must never pull whole portfolios.
> - **The section list is virtualised** inside the card, with estimated section heights so windowing doesn't thrash on measurement.
> - **One video plays at a time**, in the focused card only, and only while its section is at least half visible.
> - **Card-width rendering is a first-class constraint on the block library**, not an afterthought. It bounds how much layout freedom the portfolio studio can offer.
> - **Gesture arbitration by direction lock.** The first significant movement in a gesture claims its axis and holds it for the duration: predominantly horizontal becomes a swipe, predominantly vertical becomes a scroll, and neither can steal from the other mid-gesture. While the scroll is under momentum, swipe recognition is suppressed until it settles. This is a deterministic rule rather than a tuned threshold, and it is how Bumble and most media viewers behave. Still to be measured on a real entry-level Android device before the block library is locked.

The standalone public portfolio page (§7.1.2) still exists and is unaffected — it serves sharing and off-platform use, which is a different job.

#### 7.2.2 Swipe mechanics

- **The swipe is the primary action.** Left to pass, right to express interest, from any scroll position in the card — the same combination Bumble ships. Equivalent buttons remain docked as a secondary affordance, for discoverability, accessibility, and users who never find the gesture. But the swipe is the interaction the deck is designed around, and it carries the session rhythm.
- **Undo** the last swipe (limited for free bookers, unlimited for paid).
- Right-swipe **always lands in a shortlist**. If a role is active, it goes to that role's shortlist; otherwise to a general "Saved talent" list. This is the key adaptation of the Tinder metaphor for professional use — the output of a session is an artefact, not a series of one-off matches.
- Left-swipe suppresses the card for the active role, and decays globally over ~30 days. Never a permanent removal, because a talent wrong for one role is right for another.
- **Session goal** — optional target ("shortlist 10 for this role") with a progress indicator, so sessions have a natural end.
- **Deck exhaustion** — when relevant talent runs out, show a clear end state with suggested filter relaxations rather than padding with irrelevant cards.
- **Compare view** — shortlisted talents viewable side by side on their key attributes. Particularly important for crew, where the decision is deliberative and rarely made in a single pass.

#### 7.2.3 Deck curation

The deck must feel right before a booker touches a filter (goal G3).

**Cold start (no project, no filter), in priority order:**

1. **Booker vertical → category weighting.** A declared casting director gets a deck weighted toward actors, then models, then presenters. Maintained as an editable ops mapping table, not hardcoded.
2. **Geography.** Same city first, then same country, then region. Lagos and Abuja will dominate early; surface strong talent from other cities deliberately to avoid a pure-capital bias.
3. **Portfolio quality.** Completeness, media quality, showreel presence, credit depth. The single biggest lever on first-session satisfaction — a thin deck of empty profiles kills retention.
4. **Freshness and activity.** Recently active and recently updated talent ranked up; dormant talent down. Prevents the deck from becoming a graveyard.
5. **Exposure fairness.** Deliberate injection of new and under-exposed talent into every deck, and a cap on how often any one talent appears across all decks in a period. Without this, the top 5% absorb all interest and the supply side churns.
6. **Responsiveness.** Talents who accept interests and reply to messages rank up over time.

**Once a role is defined**, its requirements act as soft ranking weights in addition to hard filters — a talent who matches everything except being slightly outside the age range should still appear, ranked lower, rather than vanishing.

**Explicitly excluded from ranking:** follower count as a primary signal, and any paid placement that isn't clearly labelled.

**Transparency:** each card can show a short "why you're seeing this" reason ("Yoruba-speaking actress in Lagos, matches your role"). Trust in the deck is the product.

### 7.3 Filters

Progressive disclosure — a few high-value filters up front, full set behind "All filters."

- **Universal:** category, location plus radius, willingness to travel, availability window, verification status, rate range, language, experience level.
  - **Rate filtering must not punish privacy.** Talents who hide their rate are grouped as "rate on request" and shown alongside filtered results rather than excluded. Otherwise the filter quietly forces disclosure, and the toggle in §7.1.1 becomes meaningless.
- **On-camera:** age range, gender, height, body measurements, hair, complexion, visible tattoos and piercings, accents performable, specific skills.
- **Crew and creative:** discipline, years of experience, equipment owned, software, genres worked in.
- **Saved filter sets**, reusable across projects.
- **Live result count** as filters change, so bookers understand when they've over-constrained.
- **Free-text search** across portfolios (Phase 2: natural-language search — "Igbo-speaking actress, 20s, can drive, Enugu").

#### 7.3.1 Sensitive-attribute policy

Complexion, ethnicity, and body type are genuine casting requirements — a role written as a 60-year-old Hausa man legitimately requires those attributes, and pretending otherwise makes the product useless to its core user. They are also the single surface where Castly could become a discrimination engine. The resolution is not to ban the attributes but to **bind them to a declared role rather than to casual browsing**, so every sensitive query has a stated purpose behind it.

**Three tiers, with different rules for each:**

| Tier | Attributes | Rules |
|------|-----------|-------|
| **Standard** | Height, hair, eye colour, tattoos and piercings, age range playable, dress and shoe size, languages, accents, skills, location, experience | Freely filterable. Routine casting data, uncontroversial. |
| **Sensitive** | Complexion, ethnicity and heritage, body measurements, gender | Filterable **only when a Role with a written brief is active**. Usage is logged against that role. Acts as a soft ranking weight, never a hard exclusion. |
| **Prohibited** | Religion, health and disability status, marital status, sexual orientation, pregnancy, HIV status | **Not collected at all.** No field, no filter, no free-text prompt that invites it. |

**Rules that apply across all tiers:**

- **Self-declared and optional.** Every sensitive field is individually toggleable by the talent. Never inferred from photographs, never required for a complete profile, and explicitly **excluded from the completeness meter** — a talent must never feel that withholding their ethnicity costs them visibility.
- **Neutral taxonomy.** No colourist ladders and no ranked scales. Complexion uses a small neutral set (light / medium / deep / any), and heritage is self-selected from a list rather than assigned. Where possible, "look" is communicated through photographs, which is what casting actually works from anyway.
- **Soft weighting, not exclusion.** Consistent with §7.2.3 — a talent outside a sensitive parameter ranks lower rather than disappearing.
- **Excluded from ranking and analytics.** Sensitive attributes never feed general deck ranking, and never appear in aggregate dashboards or exports.
- **Audited.** Sensitive filter use is logged per booker and per role. Ops reviews outliers — for example, a booker who applies the same complexion filter across unrelated projects. Reviewable rather than automatically punitive.
- **Visible to talent.** A talent can see which of their attributes are being used to surface them, in plain language.

**Before build:** this policy needs review with three to five working casting directors and a Nigerian employment lawyer. The tier assignments above are the starting proposal, not a finished legal position.

### 7.4 Open roles (talent browse surface)

Receiving interests is a passive loop, and passive loops don't bring people back weekly. Talents need a reason to open the app when nobody has swiped on them — but a conventional job board would recreate the exact problem Castly exists to solve, by handing bookers an inbox of hundreds of unfiltered applications.

The resolution: **talents can browse and raise a hand, but everything still flows back through the booker's deck.** Nothing lands in an inbox.

- **Open roles board.** Bookers can publish a role to a browsable board. Opt-in per role, default off, so a booker running a confidential casting is never exposed. A published role shows the brief, category, location, shoot window, rate range if given, and the booker's verification status.
- **Filtered to the talent.** A talent sees roles matching their categories and location by default, with light filters on top.
- **Raise a hand.** One tap, no cover letter, no message. It inserts the talent into that role's deck with a "raised hand" flag and a modest ranking boost. The booker still swipes — they are never obliged to respond, and their deck never becomes a queue.
- **Capped.** A small weekly limit on raised hands (starting at five) keeps it from becoming spray-and-pray, and keeps the signal meaningful.
- **Who's hiring.** A read-only view of recently active bookers by vertical, with no contact ability. Proof that real demand exists on the platform, which is itself a retention argument for talent.

**What this deliberately is not:** an application inbox, a messaging channel, or a place where a talent can contact a booker directly. Booker-initiated discovery remains the core loop; this is a way for talent to put a thumb on the scale.

**Guardrail.** Raising a hand must never be sellable. A paid tier may not buy extra raises or boosted raises — that edges toward charging for consideration for a specific opportunity, which §3.3 rules out permanently.

### 7.5 Matches and messaging

- Unified inbox: **Interests** (pending, talent side), **Matches**, **Chats**.
- Chat: text, image, video, voice note, document (scripts, briefs, call sheets). Read receipts and typing indicators.
- **Brief attachment** — a booker can attach a role brief to a match so the talent sees the actual opportunity, not just "hi."
- **Quick replies** for talents on slow connections ("Interested and available", "Interested, dates don't work", "Send more details").
- Report and block from any surface, with a reason taxonomy.
- **Anti-fraud interstitial** on first message from an unverified booker: a plain-language warning that Castly bookers never charge fees for auditions or roles, with a one-tap report button.

### 7.6 Trust, safety, and verification

Non-negotiable. The single largest risk to this product is becoming a channel for exploitation of young talent.

- **Tiered verification:**
  - _Phone verified_ — baseline, everyone.
  - _ID verified_ — government ID or NIN, plus liveness selfie match. Both sides can get it.
  - _Professional verified_ — for bookers: company registration (CAC), work email domain, or portfolio of past productions. Manually reviewed. Displayed prominently, because it's the signal that matters most to talent.
- Verified bookers get higher deck priority on the talent's interest list and can auto-unlock chat.
- **Reporting and moderation:** in-app reporting with categories (fee request, harassment, sexual solicitation, fake profile, impersonation, no-show). Ops review queue with SLA. Escalation path and permanent bans.
- **Content moderation** on uploads: automated nudity and CSAM detection, plus human review of flagged items. Hard rule: no minors on the platform in v1 — under-18 talent requires a guardian-managed account, deferred to Phase 2 with legal review.
- **Safety centre**: plain-language guidance on audition safety, meeting in public, never paying fees, bringing someone along. Surfaced during onboarding, in the safety warning interstitial, and permanently in settings.
- **No-show and conduct reporting** post-match, feeding a private reliability signal used in ranking. Not shown publicly in v1 — public scores invite gaming and retaliation.

#### 7.6.1 Verification cost and throughput

**What verification actually costs.** ID verification runs through a Nigerian KYC provider (Smile ID, Dojah, Youverify, Prembly, VerifyMe) that checks a submitted ID against an authoritative source — NIN via NIMC, BVN, driver's licence, voter's card — and separately runs a liveness and face-match check to prove the submitter is the person on the ID. Four costs follow from that:

1. **Per-check API fees.** Charged per lookup, with liveness usually billed separately. Unlike compute, this barely gets cheaper with scale — it is a genuine marginal cost per verified user.
2. **Failure and retry.** You pay for failed checks too, and the failure rate will not be small: poor lighting, low-end cameras, and above all name mismatches, which are endemic on Nigerian IDs — reordered names, missing middle names, spelling variants between documents. Budget roughly 1.3–1.5 attempts per successful verification.
3. **Manual review labour.** Professional verification cannot be automated. Reading a CAC certificate or assessing a production history is human work — call it five minutes each, so one reviewer clears 80–100 a day.
4. **Latency on the critical path.** Automated ID checks return in seconds. Manual professional review is the bottleneck, and it sits directly in front of booker activation — the flow you most want to be fast.

**The tension.** Verification is the product's primary safety mechanism, and also a per-user cost and a funnel drop-off point. Charging for it would put a price on safety, which collides directly with §3.3.

**Decisions:**

| Tier | Who | Cost to user | Required? |
|------|-----|--------------|-----------|
| Phone verified | Everyone | Free | Yes, at signup |
| Professional verified | Bookers | Free | **Yes — before sending a first interest** |
| ID verified | Talent | Free | No — optional, badged, modest ranking lift |

- **Mandatory booker verification is the highest-leverage safety spend in the product.** Bookers are a small population — hundreds, not hundreds of thousands — so the absolute cost is low, and it is the single signal talent actually cares about. An unverified booker may browse, but may not contact anyone.
- **Talent ID verification stays optional**, because talent is where volume and therefore cost scales. It becomes mandatory only where money or minors are involved (Phase 3).
- **Never charge for verification, in any tier.** A paid safety badge is functionally pay-to-play.
- **Budget model:** `(bookers × ~1.4 × per-check fee) + (voluntary talent verifications × ~1.4 × per-check fee) + reviewer time`. At Lagos launch scale — on the order of 100–200 bookers and a few thousand talents at perhaps 30% voluntary uptake — this is a modest monthly line item and a part-time ops role, not a major cost centre.
- **Before build:** get written volume quotes from at least Smile ID and Dojah. Per-check pricing varies enough between providers and ID types to change the model.

### 7.7 Notifications

Mobile push plus SMS fallback for high-value events, given that push delivery on low-end Android is unreliable.

- Talent: new interest received, match created, new message, portfolio milestone, verification result, profile-view digest, new open role matching their categories.
- Booker: interest accepted, new message, "new talent matching your saved role," deck refreshed.
- Frequency caps and full per-category controls. Weekly digest as a low-intensity default.

### 7.8 Monetization (v1: talent subscription)

Free tier for talents is fully functional — the marketplace needs supply liquidity more than it needs early revenue. Paid tier sells **visibility, insight, and expression**, never access to specific opportunities.

**Castly Pro (talent) — monthly and annual, priced in NGN with local payment methods (cards, bank transfer, USSD):**

- **See who viewed and who liked you** — the strongest single driver of conversion in swipe products.
- **Priority placement** — a bounded boost in relevant decks. Must be capped and labelled so it cannot hollow out deck quality; paid placement that degrades the booker's deck destroys the product.
- **Full portfolio studio** — all templates, themes, custom blocks, unlimited media. Free tier gets a solid subset.
- **Advanced portfolio analytics** — views, sources, swipe-through rate, which media performs.
- **More media storage and longer video.**
- **Custom vanity URL and branding removal** on the public page.
- **Monthly boosts** — timed surges in deck placement.

**Bookers are free in v1**, with soft usage limits (e.g. daily swipe volume, number of active projects). Deliberate: demand-side liquidity is what makes the talent subscription worth buying. Booker subscriptions and booking commission are Phase 2–3 decisions.

**Pricing is deferred.** The monthly NGN price point will be set during build, after willingness-to-pay testing with a small talent cohort. Two constraints hold regardless of the number: verification is never paid for at any tier (§7.6.1), and raising a hand on an open role is never sellable (§7.4).

### 7.9 Admin and ops console

Not optional — the curation and trust systems need human operators from day one.

- Verification review queue, with the booker professional-verification queue prioritised — it sits on the booker activation path (§7.6.1).
- Report and moderation queue with actions.
- Category and attribute taxonomy management, including sensitive-tier assignment (§7.3.1).
- **Sensitive-filter audit log** — sensitive attribute queries by booker and role, with outlier flagging.
- Open-roles moderation: published briefs are reviewable, and removable if they solicit fees or breach policy.
- Booker-vertical → category weighting table (the cold-start mapping), editable without a deploy.
- Deck and ranking configuration with the ability to inspect "why did this talent rank here."
- Talent and booker search, account actions, impersonation for support.
- Marketplace health dashboard: supply and demand by category and city, deck exhaustion rates, match and reply rates.

---

## 8. Design principles

1. **Professional, not playful.** The swipe gesture is borrowed from dating; the tone must not be. No hearts, no flames, no "it's a match!" confetti. The word "interested," not "liked."
2. **Substance on every card.** Every card carries craft signals — credits, skills, languages — not just a face. This is both an ethics requirement and a quality one.
3. **The talent's portfolio is theirs.** Expressive, self-designed, shareable, and valuable off Castly.
4. **Curation earns trust.** A booker should think "this app knows my work" in the first thirty seconds.
5. **Built for a Lagos commute.** Entry-level Android, 3G, expensive data, offline-tolerant.
6. **Fair exposure by design.** Under-exposed talent gets deliberate distribution. A marketplace where only the top 5% get seen loses its supply side.

---

## 9. Success metrics

### 9.1 North star

**Weekly matches that convert to a real conversation** — a match where both parties exchange at least three messages. It captures both sides of the marketplace and filters out idle swiping.

### 9.2 Supporting metrics

**Supply**

- Talent signups; quick-start completion rate (target: >80%)
- Portfolio depth: % with showreel, % with ≥3 credits, median blocks used
- % of talents receiving ≥1 interest per month (**exposure fairness — the metric that keeps the supply side alive**; target >40%)
- Interest acceptance rate; talent D30 retention
- Weekly active talents raising a hand on an open role, and the raised-hand → interest conversion rate (tests whether §7.4 actually earns the talent-side return visit)
- Portfolio-complete talents per launch category per city, against the 300 gate and 500 target (§11.1)

**Demand**

- Booker signups by vertical
- Time from signup to first shortlist of 10 (target: <10 min)
- % of first session on default deck before filtering (target: >60%)
- Swipe-right rate (a health signal — very low means poor curation, very high means poor discrimination; target 15–30%)
- Cards per session, sessions per week, deck exhaustion rate
- Card scroll depth before decision — validates whether the inline-portfolio design in §7.2.1 is being used, and differs meaningfully between on-camera and crew
- Booker D30 retention and repeat project rate

**Marketplace**

- Match → conversation rate; median booker→talent first-reply time
- Self-reported bookings ("Did this lead to work?" prompt 2 weeks post-match) — the only real proof of value in v1
- Supply/demand balance by category and city

**Monetization**

- Free→Pro conversion; Pro retention; ARPU
- Measured effect of Pro boost on interests received (must be real, or churn follows)

**Trust**

- Report rate per 1,000 matches; median moderation resolution time
- % of active bookers professionally verified (target >50% of bookers generating matches)

### 9.3 Anti-metrics — watch that these do NOT rise

- Time in app per session (fast is the goal, not sticky).
- Swipe volume with flat match-to-conversation rate (means engagement without value).
- Concentration of interests in the top decile of talent.

---

## 10. Phasing

### Phase 1 — v1 MVP (this PRD)

Talent onboarding and portfolio studio · public portfolio pages · booker onboarding with vertical profiling · curated swipe deck with inline full-portfolio cards · filters with sensitive-attribute guardrails · projects, roles, shortlists · compare view · open-roles board with raise-a-hand · interests, matches, chat · tiered verification with mandatory booker verification · reporting and moderation · admin console · Castly Pro for talent.

### Phase 2 — Transaction structure

Structured booking requests (dates, rates, brief, accept/decline) · availability calendar · full casting calls with structured applications, building on the v1 open-roles board · team collaboration on shortlists with comments and voting · agency and roster tooling · verified testimonials from completed bookings · natural-language search · booker subscriptions · guardian-managed accounts for minors · broader crew and events categories.

### Phase 3 — Marketplace depth

Escrow payments and contracts via Paystack/Flutterwave · commission on bookings · self-tape auditions and remote audition workflow · reliability and reputation system · desktop web app for bookers · multi-country expansion (Ghana, Kenya, South Africa) with localised taxonomies, currencies, and payment methods.

---

## 11. Go-to-market considerations

The product is a chicken-and-egg marketplace, and the PRD should be honest that **the launch strategy is a product requirement, not a marketing afterthought.**

- **Supply first, concentrated.** Launch in Lagos only. A thin deck makes the core experience fail regardless of how good the app is.
- **Recruit demand by hand.** The first 50 bookers should be personally onboarded casting directors, music video directors, and agency producers. Their first session must be excellent, which argues for hand-curating their initial decks.
- **Organic loop:** talents sharing their own portfolio links to WhatsApp and Instagram is the cheapest growth channel and is already in scope via public pages.
- **Category-by-category, city-by-city expansion**, gated on supply depth in each.

### 11.1 Launch categories

Every category added multiplies the supply needed, because a deck has to be deep in the category the booker came for. So categories are chosen by **demand density**, not by how easy they are to recruit. Four core categories, plus one deliberate crew beachhead:

| Category | Why it makes the cut |
|----------|---------------------|
| **Actors** | Highest demand volume — Nollywood, streaming, commercials — and the most acute discovery pain on both sides |
| **Models** | Serves brand and agency bookers; supply is plentiful and visually native to a deck |
| **Dancers** | Serves music video directors, a vertical with real budgets and fast turnarounds; video-first, which showcases the portfolio product |
| **Makeup & hair artists** | Booked on essentially every production regardless of type, so they serve every booker vertical; portfolio-native through before/after galleries |
| **Photographers & cinematographers** *(crew test)* | Deliberately small. Tests the crew-deck design from §7.2.1 before committing to broad crew coverage |

Events talent (MCs, DJs, hype men) and the wider crew taxonomy are held back. Each would pull in a whole booker vertical that needs its own supply depth.

**Depth targets.** Measure **portfolio-complete talents**, not signups — a category with 2,000 empty profiles is worse than one with 300 good ones. Portfolio-complete means hero media, at least three photos, a bio, three or more structured attributes, and for actors and dancers a showreel.

- **Gate to open a category to bookers:** 300 portfolio-complete talents in Lagos.
- **Target by end of first month live:** 500 per core category — roughly 2,000 complete portfolios overall.
- The rationale for ~500: enough that a booker can swipe for 20 minutes without exhausting the deck, that two bookers in the same vertical don't see near-identical decks, and that the exposure-fairness caps in §7.2.3 are actually satisfiable.

### 11.2 Agencies

Agencies cut both ways. One signup can deliver 40 vetted, portfolio-ready talents, which is precisely what the cold-start problem needs. But agencies are also the gatekeepers the product exists to route around — if they dominate early supply, the deck becomes the same closed circle, just digitised.

The resolution is structural rather than a matter of degree:

- **Court agencies for seeding, but grant them no advantage.** No ranking boost, no exclusivity, no placement. They are a fast way to import supply, nothing more.
- **The talent always owns the account.** An agency receives delegated access; it never holds the account. This is the load-bearing rule — if the agency owns the profile, gatekeeping has simply been rebuilt inside Castly. Talent-ownership means a talent can leave their agency and keep their portfolio, credits, and match history.
- **The talent chooses where booking messages route** — to themselves, to their manager, or both.
- **No agency tooling in v1.** Rosters, commission splits, and agency dashboards wait for Phase 2. For the launch cohort, bulk profile creation is handled by ops by hand.

---

## 12. Risks

| Risk                                                                                                             | Severity | Mitigation                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Exploitation and fraud** — the platform becomes a channel for fee scams or sexual solicitation of young talent | Critical | Professional verification for bookers; mutual-interest gating; safety interstitials; fast moderation SLA; permanent bans; no minors in v1         |
| **Cold start / thin deck** — bookers churn on their first session                                                | Critical | Lagos-only launch; supply seeding targets; hand-curated first decks; deck exhaustion end states                                                   |
| **Swipe metaphor reads as superficial or degrading** for professional work                                       | High     | Substance on every card; "interested" not "liked"; professional tone; shortlist-as-output framing; no looks-based ranking                         |
| **Discrimination surface** — complexion and body filters enable systematic bias                                  | High     | Three-tier attribute policy (§7.3.1): sensitive filters bound to a declared role, logged and audited; prohibited attributes never collected      |
| **Winner-take-all exposure** — top talent absorbs all interest, everyone else churns                             | High     | Exposure fairness injection; per-talent appearance caps; % of talents with ≥1 interest as a tracked metric                                        |
| **Portfolio builder scope creep** — the studio becomes an unshippable website builder                            | High     | Ship curated templates and themes, not free-form design; block library is fixed and versioned; one custom block as the escape hatch               |
| **Low-end device and data constraints** kill a media-heavy product                                               | High     | Aggressive compression; proactive data-saver mode; resumable queued uploads; offline tolerance; hard performance budgets                          |
| **Inline-portfolio cards are too heavy to swipe smoothly** on entry-level Android                                | High     | Focused card only mounts the depth layer; virtualised section list; one video at a time; 12-section cap; card-width rendering as a block-library constraint; prototype on a low-end device before locking the studio |
| **Accidental swipes while scrolling** — a booker loses a talent they were reading                                | Medium   | Direction lock on first significant movement; swipe suppressed during scroll momentum; undo always available; left-swipes are never permanent (§7.2.2) |
| **Agencies rebuild gatekeeping inside Castly**                                                                   | Medium   | Talent always owns the account; agencies get delegated access only; no ranking advantage or exclusivity (§11.2)                                   |
| **Disintermediation** — everyone moves to WhatsApp immediately                                                   | Medium   | Accepted in v1 (chat is the goal, not lock-in). Phase 2–3 value must come from booking structure and payments, not from blocking contact exchange |
| **Talents won't pay**                                                                                            | Medium   | Free tier stays fully functional; Pro sells insight and visibility; validate willingness to pay early with a small cohort                         |
| **Fake and stolen portfolios**                                                                                   | Medium   | ID verification; reverse-image checks on hero media; credit verification in Phase 2; reporting                                                    |

---

## 13. Decision log

The ten open questions raised in v0.1 were resolved on 16 September 2026. Decisions are folded into the sections referenced below; this log records what was decided and why, so the reasoning survives.

| # | Question | Decision | Where |
|---|----------|----------|-------|
| 1 | Sensitive-attribute policy | Three tiers — standard, sensitive, prohibited. Sensitive attributes are filterable only against a declared role, logged, and act as soft weights. Prohibited attributes are never collected. | §7.3.1 |
| 2 | Talent-side engagement | Add an open-roles board with one-tap "raise a hand" in v1. No application inbox — raises flow back into the booker's deck as a flag. | §7.4 |
| 3 | Crew discovery | Crew gets a deck. Cards scroll vertically into the full portfolio inline (Bumble-style), so there is no separate profile screen; crew cards open partially expanded on work samples. Portfolios are ordered sections, capped at 12, virtualised on mobile and stacked on web. | §7.2.1 |
| 4 | Rate transparency | Talent sets rates with a visibility toggle (public / verified bookers only / hidden). Hidden rates group as "on request" in filters and carry no ranking penalty. | §7.1.1, §7.3 |
| 5 | Agencies | Welcome as a supply channel with no ranking advantage. The talent always owns the account; agencies get delegated access. No agency tooling until Phase 2. | §4.1, §11.2 |
| 6 | Verification cost | Free at every tier. Professional verification is mandatory for bookers before their first interest; talent ID verification is optional. Never charge for safety. | §7.6.1 |
| 7 | Launch categories | Actors, models, dancers, makeup & hair, plus photographers/cinematographers as a crew test. Gate at 300 portfolio-complete per category, target 500. | §11.1 |
| 8 | Pro pricing | **Deferred** — to be set during build, after willingness-to-pay testing with a talent cohort. | §7.8 |
| 9 | Card media autoplay | On by default, muted, one video at a time. Data-saver mode offered proactively on metered or slow connections. | §7.2.1, §7.1.3 |
| 10 | Product name | **Recommendation below** — decide before any brand spend. | §13.1 |

### 13.1 Product name — recommendation

**Recommendation: keep Castly through launch.** The v0.1 worry was that the name skews toward casting and film and under-serves crew, music, and events. That worry is real but premature — the launch category set (§11.1) is casting-adjacent almost in its entirety, and naming for a market you don't yet serve is a reliable way to end up with something generic. Castly is short, easy to say, and reads well in a URL, which matters because the public portfolio link is a primary growth channel.

**Judge any alternative against these criteria**, in rough order of importance:

1. **Survives being said aloud in a WhatsApp voice note.** The name will mostly travel as "check my ___ link." Short, phonetic, unambiguous in spelling on first hearing.
2. Works for both sides — talent and booker.
3. Pronounceable across Yoruba, Igbo, Hausa, and Nigerian English speakers, with no unfortunate meaning in any of them.
4. Not so film-specific that crew, music, and events feel excluded, if those become major revenue lines.
5. Domain, plus Instagram and X handles, realistically obtainable.
6. Trademarkable in Nigeria and defensible as the product scales into Ghana, Kenya, and South Africa.

**If the decision is to change**, the two strongest directions:

- **Sabi** — Pidgin for skill or know-how ("she sabi"). Four letters, already in everyone's mouth, covers talent and crew equally, and is authentically Nigerian rather than an imported metaphor. Risks: a common word is hard to trademark and hard to acquire domains for, and it loses meaning outside Pidgin-speaking markets — a real constraint on the Kenya and South Africa expansion in Phase 3.
- **Callsheet** — industry-native and unambiguous to professionals. A call sheet lists cast *and* crew, so it solves the inclusivity concern directly. Slightly long, and less legible to the brand-manager persona who doesn't know the jargon.

**Process.** Do not settle this on taste. Test the shortlist with about 20 Lagos talents and bookers: say it aloud, ask what they think the product does, and ask them to spell it unprompted. Run trademark, domain, and handle checks before commissioning any design work — the cost of renaming rises sharply after a logo exists.

### 13.2 Still open

1. **Pro pricing** (question 8) — deferred by decision, to be resolved during build.
2. **Product name** (question 10) — recommendation above; awaiting a decision before brand work.
3. **Sensitive-attribute tiers** — the policy in §7.3.1 is written but still needs review with working casting directors and a Nigerian employment lawyer before it is treated as final.
4. **Verification unit costs** — the model in §7.6.1 needs real volume quotes from Smile ID and Dojah.
5. **Card rendering performance** — the inline-portfolio decision in §7.2.1 needs a prototype on a low-end Android device before the portfolio block library is locked.

---

## 14. Appendix: talent taxonomy (draft)

To be validated with practitioners. Structured as category → subcategory, because filters and deck weighting both depend on it.

**On-camera**
Actor (film, TV, theatre, commercial) · Model (editorial, commercial, runway, fit, promo) · Dancer · Presenter / Host / MC · Comedian / Skit maker · Musician / Vocalist / Instrumentalist · Extra / Background · Stunt performer · Voice artist · Hype man · DJ

**Crew — camera and picture**
Director · Director of photography / Cinematographer · Camera operator · Gaffer · Grip · Drone operator · Photographer · Editor · Colourist · VFX artist · Animator

**Crew — sound**
Sound recordist · Boom operator · Sound designer · Music producer · Mixing and mastering engineer · Composer

**Crew — look and design**
Makeup artist · Hair stylist · Gele artist · Wardrobe stylist · Costume designer · Set designer / Art director · Props · Special effects makeup

**Production**
Producer · Line producer · Production manager · Assistant director · Casting director · Location manager · Script supervisor · Writer

**Live and events**
Event planner · Stage manager · Lighting designer · Choreographer · Usher / Brand ambassador · Live sound engineer
