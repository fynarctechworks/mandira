# Feature Implementation Plan — OPS-PREVIEW-01 (preview-as-app)

- **Related requirements:** PRD-OPS-CNT-001 ("preview-as-app"), PRD F19, TRD §9 Day 7 ("Ops preview-as-app link")
- **Backlog item:** audit remediation, Ops partials · **Pre-authorised by the founder** ("I am giving you all approvals"); decision logged as D-204
- **Objective:** An operator editing a place or an experience opens it in the traveler app, laid out exactly as a traveler will see it, before it is published.

## Scope
- Traveler app routes `/[locale]/preview/places/[id]` and `/[locale]/preview/experiences/[id]`.
- The body of the place and experience detail pages is extracted into shared components, so the preview and the real page cannot drift apart.
- Loaders that read the base tables (`places`, `experiences`, `availability_rules`, `guidance_blocks`) with the signed-in user's own session, plus `entity_trust()` and `accessibility_for()`.
- A banner on every preview: not published, only Ops can see it, and, when it applies, that travelers will not see the entity until its critical fields reach human review (the same `critical_fields_gated()` the published views use).
- A "Preview in app" link on the Ops place and experience editors, in each active locale.

## Out of scope
- Destination pages (many sections, each its own published view) — a follow-up once this pattern is proven.
- Share links for people without an Ops role. A token that shows unpublished content to anyone holding it is a publish-gate decision for the founder, not part of this item.
- Routes, transport and guidance have no traveler detail page to preview.

## How access works (no change to the publish gate)
- Travelers never read unpublished rows: the `v_published_*` views and RLS are unchanged.
- The preview reads the base tables as the signed-in user. Only Ops roles have read policies on them, so a traveler's query returns nothing and the page is a 404. The page also checks `is_ops()` first, so the 404 does not depend on an empty result.
- `/preview` is signed-in only in middleware (UX), with RLS as the control (CLAUDE.md §4).
- Ops and the traveler app share one Supabase Auth, so an operator signs in to the traveler app with the same account.

## Offline and caching
- The service worker answers `/preview/` navigations network-only, before the NetworkFirst page rule, so a draft is never stored on a device.
- Pages are `force-dynamic` and `noindex`.
- No Save, Report or Add-to-journey on a preview: those write against an entity travelers cannot see.

## Database changes
None expected. If an Ops read policy is missing on a table the preview needs, it is added in an additive migration with a pgTAP test.

## Permission changes
None beyond the above. Verified by an e2e test that a traveler gets a 404 and an Ops user gets the page.

## Risks
1. **A draft reaching a traveler.** Mitigation: RLS on base tables plus the in-page `is_ops()` check; e2e as a traveler.
2. **A draft cached on an Ops phone and shown offline later as if current.** Mitigation: network-only for `/preview/`.
3. **Preview drifting from the real page.** Mitigation: one shared body component for both.

## Testing strategy
- Type-checked against the generated schema: the loaders map base-table rows into the same `PlaceDetail`/`ExperienceDetail` the real pages use.
- E2E (web): an Ops user previews a draft place (created in Ops) and an existing experience and sees the banner; a traveler gets a 404 and a guest is sent to sign-in, neither seeing the draft.
- E2E (Ops): the editors link to the preview.
- Existing detail-page e2e must stay green after the extraction.

## Acceptance criteria
- [x] An Ops user opens a draft place and an experience in the traveler app, with the preview banner.
- [x] The banner says when the publish gate would hide the entity.
- [x] A traveler or guest cannot see a draft through the preview route.
- [x] Preview pages are never cached by the service worker.
- [x] Place and experience detail pages are unchanged for travelers (detail, add-to-journey and saved-places e2e).
