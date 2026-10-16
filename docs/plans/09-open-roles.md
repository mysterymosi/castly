# M9 — Open roles

**Goal.** A talent can raise a hand on a published role and appear higher in that role's deck. No plan can sell extra or boosted raises.

**Depends on.** M4 — roles with briefs. M5 — scoring already has `raisedHandFlag` (currently 0). M7 — `role.publish` is gated on `verifiedBooker`.

**Spec references.** PRD §7.4, §3.3. TECH_SPEC §5.7 `raised_hands`, §15.

---

## Tasks

### 9.1 Publish toggle

`role.publish` / `unpublish`. Default off. Published role shows brief, category, location, shoot window, rate range if given, booker verification status.

Admin can unpublish a brief that solicits fees.

**Acceptance.** Unpublished roles do not appear on the board. Publishing requires verified booker. Confidential default remains off for new roles.

### 9.2 Board for talent

`openRole.browse` defaults to the talent's categories and city, with light extra filters.

**Acceptance.** A Lagos actor does not see an Abuja gaffer role by default. They can widen location if they choose.

### 9.3 Raise a hand

One tap. No cover letter, no message. Transaction: enforce weekly cap (default 5), unique `(talent_id, role_id)`, insert `raised_hands`.

Does not create a chat or an application inbox. Booker is not obligated to respond.

**Acceptance.** Sixth raise in a week fails. Duplicate raise on the same role fails. Booker's inbox does not gain a message.

### 9.4 Wire `raisedHandFlag` into M5 scoring

Non-zero weight from `ranking_weights`. Talent with a raised hand for the **active role** gets the boost in that session only.

**Acceptance.** Golden-deck or integration: same pool, role session, raised-hand talent ranks above an otherwise equal talent. Flag is 0 when the booker has no role or a different role.

### 9.5 Who's hiring

Recently active bookers by vertical. No contact, no profile deep-link that starts a chat.

**Acceptance.** Talent can see that casting directors are active this week; tapping one does not open messaging.

### 9.6 Unsellable guard

In the entitlement/subscription module (stub if M10 not done): **no plan grants extra raises or boosted raises**. Encoded as a test that will keep failing if M10 adds a feature flag that violates it.

**Acceptance.** A test constructs a hypothetical `plan = 'pro'` with `extra_raises: 10` and `can(user, 'extra_open_role_raises')` is false. M10 must not weaken this test.

### 9.7 Notifications

Talent: new open role matching their categories (respect frequency caps from M6).

**Acceptance.** Publishing a matching role notifies once, not on every board refresh.

### 9.8 Open-role moderation

Admin list of published briefs; remove if fee solicitation or policy breach.

**Acceptance.** Ops can take a role off the board without deleting the project.

---

## Exit gate

Raised hand measurably lifts deck position for that role. Weekly cap holds. Entitlement test forbids selling raises. Publish defaults off.

## Deferred

- Structured applications / casting calls (Phase 2)
- Web listing of open roles (optional follow-up; mobile is enough for v1)

## Risks

| Risk | Decision if it materialises |
|------|------------------------------|
| Bookers never publish because default-off is too quiet | Prompt once after creating a role; do not default on |
| Raise-a-hand becomes spam even at 5/week | Lower the cap via `ranking_weights` / feature flag, no code change required if cap is config |
