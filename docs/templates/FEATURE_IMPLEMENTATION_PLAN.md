# Feature Implementation Plan — <FEATURE-ID> <Feature name>

- **Related requirements:** <REQ IDs>
- **Backlog item:** <B-xxx>  ·  **Milestone:** <M#>
- **Objective:** <one paragraph — what user/ops outcome this delivers>

## Scope
<bullets: exactly what will be built>

## Out of scope
<bullets: adjacent things deliberately not touched>

## Dependencies
<upstream features (status), providers, knowledge/data prerequisites>

## Existing functionality affected
<files/components/routes/tables reused or modified; result of repo search>

## Database changes
<migration file name; tables/columns/enums/views/triggers/RLS; confirm additive-only>

## Backend/API changes
<routes added/changed with exact paths; jobs; rate-limit scopes>

## Frontend changes
<screens/components; states (loading/empty/error/success); offline behavior; i18n keys>

## Permission changes
<RLS policies, roles, workflow constraints; how verified>

## Integration changes
<providers touched; degradation behavior>

## Files expected to change
<list>

## Risks
<top 3 with mitigation>

## Edge cases
<explicit list — include: offline, empty knowledge, low-confidence trust, tier-rule boundaries, timezone/day boundaries where relevant>

## Testing strategy
<unit/integration/e2e/authorization tests to add; fixtures needed>

## Acceptance criteria
<copied from registry/PRD, made checkable>

## Rollback considerations
<feature flag? additive migration safe? what to disable if broken in prod>
