# Feature Implementation Plan — OPS-PUB-01/02, OPS-QUEUE-04, OPS-MEDIA-01

- **Related requirements:** PRD-OPS-WF-004, PRD-OPS-WF-008, PRD-OPS-WF-009, PRD-KNOW-003
- **Backlog item:** B-012 · **Milestone:** M1 (Day 7)
- **Objective:** Turn a draft into published content — validation, submit, approve, publish — plus the media library whose licences that validation depends on.

## Scope
- `validate_for_publish()` in SQL implementing the PRD F18 rule list, returning `[{field, message}]` so a refusal can name what is wrong.
- `publish_entity()` — the only path to `status = 'published'`, enforcing validation, the approver role and separation of duties.
- `record_audit()` — the single controlled write path into the append-only audit log.
- O13 approve queue, and a submit/approve/publish panel on each entity editor.
- O16 media library: upload to the `media` bucket with a **required** licence, plus attach-to-entity.
- Storage buckets `media` / `reports` / `captures` with policies.

## Out of scope
- The Review (O10), Verify (O11) and Conflicts (O12) queues as *work lists* — M3 (B-029/B-030). B-011 already delivers inline verification.
- Affected-journey counts and notification preview on approve: there are no journeys yet (B-019+), so the count would be a decorative zero.
- Version restore (PRD-OPS-WF-008 second half) → M4 with O20.

## Database changes
`0011_publish_validation.sql` — buckets, storage policies, `has_any_locale()`, `validate_for_publish()`, `record_audit()`, `publish_entity()`. Additive.

## Permission changes
Storage policies for the three buckets. `record_audit` and the publish/validate functions are granted to `authenticated`; the role checks live inside them.

## Risks
1. **A publish path that bypasses the gate.** Mitigation: `publish_entity()` is the only writer of `published` status, and the `v_published_*` views remain an independent second layer.
2. **Losing the reason a publish was refused.** Realised during build: the action wrapper flattened every throw into one generic apology. Handlers can now attach `userMessage`.
3. **Unlicensed media reaching published content.** Mitigation: licence required at upload, and validation blocks the entity regardless.

## Testing strategy
pgTAP drives the whole gate: each validation rule individually (missing trust, pin outside radius, unlicensed media, open conflict, experience without availability), then role and separation-of-duties refusals, then a successful publish with its audit entry. Playwright covers the operator's path, including that a single operator cannot take a draft to published and is told why.

## Acceptance criteria
- [x] A blocked publish names the fields at fault.
- [x] Publishing requires the approver role and refuses self-approval.
- [x] Publishing writes an audit entry.
- [x] Media requires a licence; unlicensed media blocks its entity.
