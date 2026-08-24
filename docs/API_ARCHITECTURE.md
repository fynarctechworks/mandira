# API Architecture

Canonical surface: **TRD §5** (engine functions §5.1, traveler routes §5.2, ops routes §5.3, jobs §5.4, degradation §5.5). Route names and payload field names are used verbatim in code.

## Conventions
- Envelope: `{ ok: true, data } | { ok: false, error: { code, message } }`; error codes: `unauthorized`, `forbidden`, `not_found`, `validation_failed`, `rate_limited`, `conflict`, `degraded_dependency`, `internal`.
- Versioning: none needed while first-party-only; breaking payload changes require DECISION_LOG entry + coordinated client release (PWA makes this safe).
- Idempotency: journey mutations accept optional `Idempotency-Key` header stored 24 h (guards flaky mobile networks).
- Pagination: cursor-based `{ cursor, limit ≤50 }` on all list endpoints; Ops tables may request ≤200.
- Caching: published-content GETs set `Cache-Control: s-maxage=300, stale-while-revalidate=3600`; everything user-scoped is `no-store`.
- Direct Supabase reads from clients are allowed **only** for `v_published_*`, `locales`, own-row tables under RLS; all writes with business rules go through routes.
- Realtime channels: `journeys:id=eq.{id}` (multi-device sync), `notifications:user_id=eq.{uid}` (in-app).
