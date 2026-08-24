# Security Architecture

Canonical: **TRD §6**. Operating checklist:

- **Secrets:** env only (Vercel/Supabase); `.env.example` committed; service-role key never in client bundles (CI grep check).
- **Headers:** CSP per TRD §6.1; HSTS; `X-Content-Type-Options: nosniff`; frame-ancestors none (except share page allows none too — it's a plain page).
- **Rate limiting:** TRD §6.2 table via `rateLimit(scope, key)`; 429 + Retry-After; scopes must exist for every new public route (review checklist item).
- **Storage:** `media` public (licensed only); `reports`/`captures` private, signed URLs 15 min, 5 MB, image-type sniffing on upload.
- **Auth hardening:** magic-link expiry 10 min; email rate limit 5/h; session refresh via @supabase/ssr middleware; account deletion honors 30-day window.
- **Audit:** every Ops mutation → `audit_log` (trigger); `ip_hash` = SHA-256(ip + daily salt); logs immutable (no update/delete policy).
- **Share tokens:** 32-byte random, expiring, revocable; content excludes traveler profiles/notes (TRD-SEC-004).
- **AI safety:** grounding + write-boundary per TRD §7.3 (code-enforced); ai_calls has no user identifiers.
- **Supply chain:** pnpm audit + Dependabot; lockfile committed; no postinstall scripts from unknown packages.
- **Abuse cases to test:** IDOR on journeys/reports (RLS tests), role escalation via client-supplied role, publish-gate bypass attempt, report spam (rate limit + downgrade threshold needs 3 *independent* reporters — distinct reporter_hash).
- **Incident basics:** Sentry alert → runbook (docs in M1 D20) → Vercel rollback + key rotation procedure documented.
