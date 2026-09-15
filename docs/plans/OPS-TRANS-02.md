# Feature Implementation Plan — OPS-TRANS-02 (translate an entity side by side)

- **Related requirements:** PRD-OPS-CNT-004 (P1), PRD F19 ("per-entity, per-locale, side-by-side source/target, AI draft suggestion (flagged `ai_draft`), translator confirms; completeness dashboard per locale"), TRD-AI-003, TRD §5 `POST /api/ops/translate/suggest`, AUTHORIZATION_MODEL ("Translations: translator")
- **Backlog item:** audit remediation, Ops partials · **Pre-authorised by the founder**; decision logged as D-205
- **Objective:** A translator opens a place, an experience or a destination, sees every translatable field in English beside the target language, writes or accepts a suggestion, and confirms it — and O17 shows how much content is confirmed in each language and what to do next.

## Scope
- `content_translations` (0049): one row per entity, field and non-English locale — status (`ai_draft`, `draft`, `confirmed`) and the English text the translation was made from.
- `save_content_translation()`: the only write path. Translators, editors and admins; non-English locales only; active locales only; a fixed allowlist of `_i18n` fields per table; writes that one locale's value into the entity's column and the status row together.
- `content_translation_overview(locale, limit)`: per-locale totals and the entities with the most unconfirmed fields, for Ops roles. Counts and entity names only.
- O17 entity page `/translations/[table]/[id]`: a row per field — English, the target text, its state (Missing, AI draft, Draft, Confirmed, English changed since), Suggest, Save draft, Confirm.
- O17 overview section: per-locale confirmed share and a "Next to translate" list.
- A "Translate" link in the destination, place and experience editors.
- `suggestContentTranslation`: an AI suggestion for one field, returned to the translator and never stored (TRD-AI-003). Rate-limited by the existing `ops_translate_suggest` bucket. A suggestion that changes a time or number is discarded, as for interface strings.

## Out of scope
- Guidance blocks, advisories, routes, transport notes and accessibility notes — the same function takes more tables by extending the allowlist; follow-up.
- Phrases (already have their own editor, D-175).
- Translation memory or glossary.

## Database changes
`0049_content_translations.sql` — table, RLS (Ops read, no client writes), `translatable_fields()`, `save_content_translation()`, `content_translation_overview()`. Additive.

## Permission changes
- Translators gain one narrow write: a non-English value of an allowlisted `_i18n` field, through the function. They still cannot change English, structured fields, trust, status or publishing.
- The table has no insert/update/delete grant for clients.
- Critical fields (`closure_rules_i18n`, `entry_requirements_i18n`, `advance_booking_how_i18n`) are translatable, as the PRD requires. Their trust records stay on the field; translating does not change verification. Flagged for founder review in D-205.

## Risks
1. **A mistranslated critical fact.** Mitigation: a translator confirms every value; "English changed since" resurfaces a translation when the source moves; AI text is never saved without a person.
2. **A write path wider than intended.** Mitigation: allowlist in SQL, `en` refused, pgTAP asserts a translator cannot change English, a non-allowlisted field, or `status`, and a traveler cannot call it.
3. **Stale translations looking done.** Mitigation: completeness counts only confirmed values whose English still matches.

## Testing strategy
- pgTAP: role refusals, `en` refused, field allowlist, inactive locale, the value lands in the column with its status, clearing removes both, English change makes it stale in the overview, a traveler reads nothing.
- Unit: the field state helper (missing / ai_draft / draft / confirmed / english_changed).
- E2E (Ops): open a place's translation page from its editor, save a Telugu draft, confirm it, see it counted; the overview lists languages; axe.

## Acceptance criteria
- [x] A translator sees English and the target side by side for every translatable field of a place, experience or destination.
- [x] Saving as draft and confirming both persist, and only confirmed values count.
- [x] A change to the English marks the translation "English changed since".
- [x] AI suggestions are marked and never stored until a person saves them.
- [x] A translator cannot change English or any other column.
