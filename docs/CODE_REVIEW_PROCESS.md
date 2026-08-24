# Code Review Process (self-review for AI-assisted development)

Run after implementation, before testing sign-off. **Report important findings before making major corrective changes** — do not silently rewrite.

## Checklist (all categories every review)
1. **Requirement compliance:** diff ↔ registry acceptance criteria line-by-line; nothing extra, nothing missing; PRD Principles 1–6 not violated by any path.
2. **Architecture compliance:** logic in the right layer (engine/providers/db/ui); no vendor SDK outside providers; TRD names verbatim; KnowledgeBundle shape untouched or properly versioned.
3. **Logic errors:** tier rules (no PROTECTED removal / FIXED move anywhere), option-ladder order, return guard, availability resolution across day boundaries and timezones, buffer multipliers.
4. **Edge cases:** empty knowledge, single-item day, all-OPTIONAL day, journey spanning month boundary, traveler with no profile attributes, locale with missing content, offline mid-action.
5. **Security & authorization:** RLS present for new tables; route role checks; rate-limit scope; no secret/PII in logs or analytics; signed-URL usage; input length limits.
6. **Data consistency:** transactions where multi-table; triggers firing (versions/audit); soft-delete respected in queries; idempotent jobs.
7. **API consistency:** envelope, error codes, pagination, cache headers per API_ARCHITECTURE.
8. **Performance:** no N+1 (check generated queries), virtualisation for long lists, dynamic imports for heavy client code, bundle diff within budget.
9. **Error handling & degradation:** provider failures follow TRD §5.5; user copy per PRD §12.7; no swallowed promises.
10. **Duplication:** searched for existing equivalents; shared code hoisted to packages when used twice.
11. **Type safety:** no `any`/assertion escapes around DB rows; generated types only.
12. **Test coverage:** category-required tests exist and are meaningful (assert behavior, not implementation).
13. **Regression risk:** list downstream consumers of changed modules and how each was checked.
14. **Docs & status:** registry/status/decision-log updates staged in the same change.

Output format: short review note in the plan file — Findings (ordered by severity) → Fixed now → Deferred (with backlog note) → Confirmation checklist.
