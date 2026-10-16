# M6 — Match loop

**Goal.** Two devices go from right-swipe to a real conversation. SMS arrives when push does not.

**Depends on.** M5 — swipes of type `interest`, shortlists, deck sessions.

**Spec references.** PRD §6.3, §7.5, §7.7. TECH_SPEC §5.7, §6 (`interest`, `match`, `message`), §13, §14, §2.2 (Realtime exception).

---

## Tasks

### 6.1 Interests

On right-swipe, write `interests` (`pending`, optional `role_id`, `expires_at`). Talent sees incoming list. `accept` / `decline` / expiry job. `setAutoAccept` for verified bookers (verification may still be stub-true until M7; wire the flag anyway).

Talent notification: "A {vertical} is interested in you" plus project if attached.

**Acceptance.** Right-swipe creates pending interest. Accept creates a match. Decline does not. Expiry flips `expired` without a match. Auto-accept on a verified booker creates a match immediately.

### 6.2 Matches and conversations

`matches` FK from `interests`. `conversations` FK from `matches`. `conversation_participants` (two rows). **No conversation row without a match** — enforced by foreign key.

**Acceptance.** Inserting a conversation without a match fails. Accepting an interest creates match + conversation + two participants in one transaction.

### 6.3 Messages via tRPC; reads via Realtime

`message.send` validates, stores, fans out notifications. `message.list`, `markRead`.

Realtime: grant `authenticated` SELECT on `messages` only when `conversation_participants` contains `auth.uid()`. Default-deny remains on all other tables.

Typing/presence: ephemeral broadcast, not persisted.

Media messages reuse M2 pipeline. Document kind allowed (scripts, briefs).

Quick replies are client-only templates.

**Acceptance.** Two devices: send appears on the other without polling. A third user subscribed to the conversation id receives nothing. Message without a match_id cannot be inserted.

### 6.4 Brief attachment

Booker can attach the role brief to the match so the talent sees the opportunity, not just "hi."

**Acceptance.** Talent opening the thread sees the brief when the booker attached one.

### 6.5 Push + SMS fallback

Expo Push via `device_tokens`. pg-boss fanout. High-value events (new interest, new match): if push unacked within a configured interval, Termii SMS.

Idempotent writes on `(user_id, category, subject_id)`.

`notification_prefs` with per-category enable and frequency cap; weekly digest default for low-intensity types.

**Acceptance.** With push permission denied, a new interest still produces an SMS to the talent's phone. Retrying the job does not send a second SMS for the same interest.

### 6.6 Inbox surfaces

Mobile: Interests (talent), Matches, Chats. Professional tone: "interested", not "liked". No confetti.

**Acceptance.** Maestro or two-device manual: swipe right → talent sees interest → accept → both land in the same chat.

---

## Exit gate

Two physical devices complete interest → accept → ≥3 messages. SMS fallback demonstrated with push suppressed. RLS prevents a stranger from reading `messages`.

## Deferred

- Anti-fraud interstitial (M7) — first message from unverified booker
- `verifiedBooker` blocking the right-swipe that creates the interest (M7)
- Report/block from chat (M7)
- Who-viewed-you (M10)

## Risks

| Risk | Decision if it materialises |
|------|------------------------------|
| Supabase Realtime drops or lags | Keep tRPC `message.list` as the source of truth; Realtime is a cache. Do not block M6 on a dedicated websocket (TECH_SPEC §26.2) |
| SMS cost / Termii latency | Keep fallback only on interest + match, not on every chat line |
