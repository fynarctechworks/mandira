# Authorization Model

## Identities
Traveler (any authenticated user) · Guest (anon, device-local drafts only) · Ops user = authenticated user with rows in `user_roles` (`ops_role_enum`: researcher, reviewer, verifier, editor, approver, translator, media, support, admin) · service-role (server/jobs only).

## Enforcement layers (all three, always)
1. **RLS** (primary): TRD §4.9 matrix. Highlights: traveler_profiles owner-only with **no ops policy at all**; base knowledge tables have no anon/traveler policy; reports readable to support/verifier/editor/admin via `reporter_hash` view only.
2. **Route guards:** `withApi({ roles })` re-checks roles server-side; Ops root layout redirects non-ops users. UI hiding is never a control.
3. **Workflow constraints in SQL:** approve rejected when approver = last editor/reviewer of the change (separation of duties, PRD-OPS-WF-009); publish blocked by validation function when any critical field trust `< human_reviewed`.

## Permission map (capability → minimum role)
Draft knowledge: researcher/editor · Review accept: reviewer · Verify + resolve conflicts: verifier · Edit any draft: editor · Publish/restore-version approval: approver (restore: admin) · Translations: translator · Media: media · Reports queue: support · Users/roles/flags/sources admin: admin.

## Sensitive-data guarantees (PRD-PRIV-002)
No code path may join traveler_profiles into ops queries, analytics, exports, or share pages — enforced by RLS absence + a CI test that greps generated SQL/queries for the table outside allowed files.
