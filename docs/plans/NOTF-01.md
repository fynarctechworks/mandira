# Feature Implementation Plan — NOTF-01 Notification scheduling and Web Push

- **Related requirements:** PRD-NOTF-001..004, TRD §5.4, TRD §2.1, INTEGRATIONS
- **Backlog item:** B-027 (the half that needs no content) · **Milestone:** M2
- **Objective:** Decide *when* a journey should say something, and be able to say it.

## Why now
Both halves are content-free. The scheduling rules are pure functions over a journey, and the push adapter is a provider like any other; VAPID keys are self-generated rather than an account somebody has to open. Everything B-027 still needs — the subscribe UI, the two Edge Functions, the in-app list — waits on B-019's journey UI.

## Scope
- `scheduleNotifications` in the engine: PRD F15's prepare deadlines (7d/1d), journey-tomorrow (18:00 the evening before) and leave-by (buffer + 15 min).
- `applyWeeklyCap` — PRD F15's "never more than one non-journey notification per week".
- `PushProvider` + the `web-push` adapter, with `shouldDisable` for TRD §5.4's five-failure rule.
- `pnpm push:keys` to generate a VAPID pair.

## Out of scope
- The two Edge Functions (`schedule_notifications`, `send_notifications`) — thin shells over what is here; they need a deployable Supabase project, which is **B-025**.
- The subscribe prompt, the in-app notification list, and per-type preference switches → the rest of **B-027**, needing B-019.
- `journey_change`, `report_resolved` and `advisory` drafts: each is raised by an event (a Change Card, a report resolution, an Ops publish), not by the journey's own shape, so they belong with the features that raise them.

## Design notes
- The scheduler is **pure**, like the rest of the engine. The Edge Function hands in the journey and the clock and persists what comes back. That is what lets the same rules run on the phone for the local leave-by reminders PRD F15 requires to work offline.
- Copy is i18n keys and params. The scheduler runs on a server that does not know the traveler's language; the sender renders from the profile locale at send time.
- Every draft carries a stable `dedupeKey`, so re-running the scheduler never queues the same reminder twice.
- Nothing already past is scheduled. A "leave in 15 minutes" that arrives an hour late is worse than silence — it is a prompt to hurry towards something already missed.
- The weekly cap is applied at scheduling, not at send. A suggestion silently dropped later is still one the product decided to make; capping where it is queued keeps that visible.
- `gone` (404/410) is a distinct result from `failed`. The browser has thrown the subscription away, and retrying forever fills the table with endpoints that will never answer.

## Risks
1. **Notifying the wrong minute.** Being an hour out means telling someone to leave for something they have missed. Mitigation: the scheduler uses the engine's existing DST-correct `fromInstant`/`toInstant` rather than a second time helper, and every lead time is asserted in local minutes.
2. **Talking at people.** PRD F15 caps non-journey notifications at one a week and forbids marketing. Mitigation: `applyWeeklyCap`, plus a test that it never touches a notification about the traveler's own journey.
3. **VAPID rotation.** Changing the keypair silently stops notifications for everyone until each browser re-subscribes. Mitigation: said plainly in the generator script and in the adapter's own comment.

## Testing strategy
31 tests. Scheduling: each lead time in local minutes, the first item of the day excluded, a task with no deadline ignored, past drafts filtered, chronological order, stable keys, i18n key shape, and each preference switch. The cap: two in one week collapsed to one, the next week allowed, a previously-sent one counted, and journey notifications never capped. Push: VAPID required at construction, TTL set, 404/410 as `gone`, 429/5xx retryable, 4xx not, a network failure retryable, the service's own message never on a result, and the five-failure rule at its boundary.

## Acceptance criteria
- [x] PRD F15's three journey-shaped types scheduled at their stated times.
- [x] Preferences respected, with PRD F15's defaults when unstated.
- [x] Weekly cap on non-journey notifications, journey notifications exempt.
- [x] Push sends over VAPID; a dead subscription is dropped and a failing one is retried up to five times.
- [x] No rendered language in the engine; no push-service message on a result.
