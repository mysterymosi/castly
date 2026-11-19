# M6 — Match loop

**Goal.** Two devices go from right-swipe to a real conversation, with push notifications for match activity.

**Depends on.** M5 — swipes of type `interest`, shortlists, deck sessions.

**Spec references.** PRD §6.3, §7.5, §7.7. TECH_SPEC §5.7, §6 (`interest`, `match`, `message`), §13, §14, §2.2 (Realtime exception).

---

## Tasks

### 6.1 Interests

**Status:** Done (API; inbox UI is 6.6). `deck.swipe` sends an interest in the swipe's own transaction (`apps/api/src/interest/`, tables `interests` and `matches`, migration `0017`). `interest.listIncoming | accept | decline | setAutoAccept` on `talentProcedure`; accept and decline are idempotent and refuse a lapsed interest even before the job has run. Expiry is `expireInterests` (one idempotent statement) run by `pnpm --filter api interest:expire`; pg-boss scheduling lands with 6.5. Auto-accept is a talent opt-in, off by default (`talent_profiles.auto_accept_verified`), and fires only for a booker at tier `professional` — nobody holds it until M7, so it is dormant, not stub-true. It applies to interests sent after it is switched on. No new interest is sent while one is pending or accepted, or after a decline (a lapsed one may be re-sent); such a swipe does not move the exposure counter. Undo withdraws a pending interest and is refused once the talent has answered. The notification wording is `interestHeadline` ("A casting director is interested in you for Lagos Nights"); delivery is 6.5. Tests: `src/interest/` (in `test:unit` and `test:integration`).

On right-swipe, write `interests` (`pending`, optional `role_id`, `expires_at`). Talent sees incoming list. `accept` / `decline` / expiry job. `setAutoAccept` for verified bookers (verification may still be stub-true until M7; wire the flag anyway).

Talent notification: "A {vertical} is interested in you" plus project if attached.

**Acceptance.** Right-swipe creates pending interest. Accept creates a match. Decline does not. Expiry flips `expired` without a match. Auto-accept on a verified booker creates a match immediately.

### 6.2 Matches and conversations

**Status:** Done (migration `0018`). `conversations.match_id` is NOT NULL with a foreign key and a unique index, so a conversation cannot exist without a match and a match has one chat; `conversation_participants` holds exactly the booker and the talent. Accepting — manually or by auto-accept — creates the match, conversation and both participants in one transaction (`acceptRow`), and `interest.accept` / `deck.swipe` return `conversationId`. The migration backfills a chat for matches made under 6.1. Tests prove the database refuses a conversation with no match, a missing match, or a second chat per match, and that deleting a user removes the chat. A forced mid-accept failure is not tested; the rollback is the shared transaction.

`matches` FK from `interests`. `conversations` FK from `matches`. `conversation_participants` (two rows). **No conversation row without a match** — enforced by foreign key.

**Acceptance.** Inserting a conversation without a match fails. Accepting an interest creates match + conversation + two participants in one transaction.

### 6.3 Messages via tRPC; reads via Realtime

**Status:** Built for text, image and video; documents and audio not built (migration `0019`). `message.send | list | markRead` on `authedProcedure`, membership checked on every call (a stranger and a missing conversation are both NOT_FOUND). `send` is idempotent on an optional `clientId`; `list` pages by message id, newest first. RLS: `authenticated` has SELECT on `messages` through a participant-membership policy that hides deleted messages, and on its own `conversation_participants` rows; `anon` has none, and nobody can write through the Data API. `messages` is in the `supabase_realtime` publication, and typing/presence use private `conversation:<id>` broadcast channels restricted by policies on `realtime.messages`. `message.conversation_id` is NOT NULL with a foreign key, so a message cannot exist without a conversation, hence a match (the plan's "match_id" is reached through it). Media reuses the M2 pipeline for image and video: the sender must own a finished upload of the right kind, once; cleanup protects it; upload procedures are now open to any signed-in user so a booker can send media. Verified live with `pnpm --filter api realtime:probe` (real JWTs and Realtime sockets: the other side receives the message, a third subscriber receives nothing, a stranger is refused the typing channel). Not done: document and audio messages — the pipeline's buckets are public-read, so scripts and briefs need a private bucket and signed downloads first; notification fan-out (6.5); the mobile Realtime client, which must open typing channels as private (6.6). Hosted Supabase: turn off "Allow public access" in Realtime settings. Tests: `src/message/`.

`message.send` validates, stores, fans out notifications. `message.list`, `markRead`.

Realtime: grant `authenticated` SELECT on `messages` only when `conversation_participants` contains `auth.uid()`. Default-deny remains on all other tables.

Typing/presence: ephemeral broadcast, not persisted.

Media messages reuse M2 pipeline. Document kind allowed (scripts, briefs).

Quick replies are client-only templates.

**Acceptance.** Two devices: send appears on the other without polling. A third user subscribed to the conversation id receives nothing. Message without a match_id cannot be inserted.

### 6.4 Brief attachment

**Status:** Done (API; thread UI is 6.6). `match.attachBrief` (booker) copies the role's offer onto the match — role, project, written brief, shoot window, rate range — and `match.get` (either side) returns it with the `conversationId`, so a talent opening the thread reads it (migration `0020`, `matches.brief` / `brief_attached_at`). It is a snapshot, not a live link: the talent sees what was offered until the booker attaches again, which replaces it. `roles.requirements` is never copied, because it can hold sensitive-tier attributes. Defaults to the role the interest was for; a role-less match needs a `roleId`, which must be the booker's own and have a written brief. The talent is not told when a brief is attached (6.5) and the thread does not update live; the client refetches `match.get`. Tests: `src/match/`.

Booker can attach the role brief to the match so the talent sees the opportunity, not just "hi."

**Acceptance.** Talent opening the thread sees the brief when the booker attached one.

### 6.5 Push notifications

**Status:** Implemented for Expo Push. An interest alerts the talent while it is pending. A match alerts both parties, including when auto-accepted. An unread message alerts the other participant without exposing its contents. A shared brief alerts the talent once per match and defaults to a weekly digest on Mondays at 09:00 in Lagos. Account settings let each user toggle the four categories. The API also supports a per-category cap over a rolling 24 hours and immediate delivery for briefs. Messages default to 20 notifications per 24 hours.

The API records each event in its source transaction, deduplicated by `(user_id, category, subject_id)`. pg-boss scans for due events every minute and queues one job per registered device. It checks Expo receipts and removes unregistered tokens. The same worker runs interest expiry every 15 minutes. If Expo accepts a push but the response is lost, a delivery retry can repeat the push.

**Setup.** Apply migration `0021` with `pnpm db:migrate` before restarting the API. Link the mobile app to its Expo project so the app config has `extra.eas.projectId`. Configure APNs for iOS and FCM v1 for Android, including `android.googleServicesFile` in the Android build config. Rebuild the native app with the notifications plugin. Set the server-only `EXPO_PUSH_ACCESS_TOKEN` if the Expo project has enhanced push security enabled. [Expo push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/)

**Verification.** API integration tests passed against PostgreSQL with mocked Expo responses. Live-device push testing is deferred until Castly has a paid Apple Developer account and can configure APNs. The push delivery exit gate remains pending.

**Device acceptance test.** On a native build, enable push from Account and send an interest from a second account. Confirm the talent receives one push per registered device. Reprocess the same event and confirm it creates no additional delivery jobs. Deny permission or disable the category and confirm subsequent interests produce no push.

### 6.6 Inbox surfaces

Mobile: Interests (talent), Matches, Chats. Professional tone: "interested", not "liked". No confetti.

**Acceptance.** Maestro or two-device manual: swipe right → talent sees interest → accept → both land in the same chat.

---

## Exit gate

Two physical devices complete interest → accept → ≥3 messages. An interest push arrives on a registered device. RLS prevents a stranger from reading `messages`.

## Deferred

- SMS fallback for new interests and matches
- Anti-fraud interstitial (M7) — first message from unverified booker
- `verifiedBooker` blocking the right-swipe that creates the interest (M7)
- Report/block from chat (M7)
- Who-viewed-you (M10)

## Risks

| Risk | Decision if it materialises |
|------|------------------------------|
| Supabase Realtime drops or lags | Keep tRPC `message.list` as the source of truth; Realtime is a cache. Do not block M6 on a dedicated websocket (TECH_SPEC §26.2) |
| SMS cost / Termii latency | Keep fallback only on interest + match, not on every chat line |
