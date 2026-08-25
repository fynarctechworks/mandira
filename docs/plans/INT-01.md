# Feature Implementation Plan — INT-01 AI provider, grounding and rate limits

- **Related requirements:** TRD-AI-001, TRD-AI-002, TRD-AI-004, TRD-SEC-001, PRD-INT-005
- **Backlog item:** B-018 (the part that needs no seeded content) · **Milestone:** M1 (Day 13)
- **Objective:** Everything that has to be true *around* an AI call before one is worth making — the provider abstraction, ID grounding enforced in code, the anonymous call log, the 24-hour cache, and the §6.2 rate limits.

## Scope
- `0012_ai_and_rate_limits.sql` — `ai_task_enum`, `ai_calls`, `ai_cache`, `rate_limits`, `consume_rate_limit()`, prune functions.
- `packages/providers/src/ai` — `AiProvider`, env-driven config and model tiers, `runAiTask` (cache → timeout → retry → fallback → log), `assertGrounded` / `keepKnownIds`, `journeyBriefSchema`, and the Vercel AI SDK binding.
- `packages/db` — `rateLimit()` over the SQL function, and the `ai_cache` / `ai_calls` stores the provider package's ports plug into.

## Out of scope (blocked or later)
- The brief-review screen, the structured form, and `POST /api/intent/extract` → they need published content to ground against (**B-013**, OPEN-001) and the discovery surfaces of **B-015**.
- `ai_extractions` and the Ops review queue → **B-029**, M3.
- Explanation rewording, search-query understanding, translation drafts, embeddings → the features that use them (M2–M4). The runtime they will use is here.
- pg_cron scheduling of `prune_ai_cache` / `prune_rate_limits` → with the other jobs at **B-025**.

## Dependencies
B-005 (generated types) and B-012 (the publish gate that produces the candidate list). No content needed — the candidate list is a parameter, not a lookup.

## Decisions taken during build
- **D-062** — the rate-limit counter is incremented inside SQL, not in TypeScript.
- **D-063** — the AI runtime takes cache and log as ports; the Supabase implementations live in `@mandhira/db`.
- **D-064** — `journeyBriefSchema` stays unsatisfiable when the candidate list is empty.
- `ai_task_enum` is an enum rather than free text, so a typo cannot split cost figures across two spellings. All three tables have RLS on and **no policies at all**, making `service_role` the only reader; the definer functions are revoked from `anon` and `authenticated` so a signed-in user cannot burn someone else's quota by passing their key.

## Risks
1. **Grounding is the whole trust story.** An invented darshan time is indistinguishable from a real one on screen. Mitigation: two layers — a Zod enum closed over the published ids, and `keepKnownIds` checking the result anyway; plus `assertGrounded` over free text, which errs towards rejecting (a false positive costs a duller sentence, a false negative costs a closed gate).
2. **A rate limiter that fails open is not one.** Mitigation: the counting is one SQL statement, tested for concurrency-safety by construction and for refusal in pgTAP; a database error returns a refusal, not a pass.
3. **Prompt text leaking into logs.** Provider error messages quote the prompt back. Mitigation: only short machine codes are stored, and a test asserts the prompt text never reaches a log record.
4. **The provider binding is unexercised.** No Gemini key exists yet (ACCT-04). Everything around the call is tested; the call itself is typechecked against the SDK's real types and nothing more.

## Testing strategy
52 new tests. pgTAP (33): table shape, the absence of any user identifier in `ai_calls`, refusal exactly at the limit, per-key and per-scope isolation, `Retry-After` derivation, pruning, and that no client role or definer grant reaches any of it. Vitest (52 across three files): claim extraction and rephrasing tolerance, id rejection with an empty candidate list, cache hit and grounding-change miss, retry then fallback then failure, timeout against a provider that ignores its abort signal, cache and log failures not breaking a reply, and the §6.2 table itself.

## Acceptance criteria
- [x] `rate_limits` + `rateLimit()` implement the §6.2 table, refusing at the limit with a `Retry-After`.
- [x] `ai_calls` carries no user identifier, no prompt and no output — asserted, not just intended.
- [x] `ai_cache` is hash-keyed, expires at 24 h, and is invalidated by a change in published knowledge.
- [x] Timeout 12 s, one retry, then the fallback provider (TRD §7.3.5).
- [x] Hallucinated experience ids cannot survive: schema enum plus a code-level check.
- [ ] End-to-end extraction against a live model — needs **ACCT-04** (Gemini key) and **B-013** (content).
