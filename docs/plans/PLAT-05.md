# Feature Implementation Plan — PLAT-05 Traveler shell & PWA

- **Related requirements:** TRD-DEPL-002, PRD-OFFL-002, PRD-LANG-002, PRD-DSGN-006
- **Backlog item:** B-014 · **Milestone:** M1 (Day 9)
- **Objective:** The frame the traveler app is built inside — locale-prefixed routes, bottom navigation, and the PWA machinery that makes offline reading possible at all.

## Scope
- `/[locale]/…` routing with next-intl; en messages, te/hi scaffolds that fall through to English.
- `getI18n()` in `@mandhira/i18n` — content fallback that reports whether it fell back, so callers can label it (PRD-KNOW-005).
- Bottom navigation: Home / Journey / Prepare / Profile, icon **and** label.
- Serwist service worker: precached shell, SWR for published knowledge, cache-first images, network-only for auth and writes.
- `manifest.webmanifest`, install prompt, update toast, offline banner with a real heartbeat.

## Out of scope
- Journey, Prepare and Profile screens themselves (B-019, B-021, later) — the nav links to routes that arrive with those items.
- Dexie snapshot and offline reads of real data → **B-023**. This is the shell and the worker; there is no journey to cache yet.
- Discovery (B-015), which additionally needs B-013 content and OPEN-009.

## Frontend changes
`app/[locale]/*`, `components/{bottom-nav,connection-banner,install-prompt,update-toast}`, `app/sw.ts`, `app/manifest.ts`, `i18n/{routing,request}.ts`, middleware combining locale routing with session refresh.

## Permission changes
None. The traveler app gates nothing — guest-first (AUTH-03).

## Risks
1. **Reloading under a traveler mid-journey.** TRD-DEPL-002 forbids it. Mitigation: `skipWaiting: false`; the worker hands over only when the update toast is tapped, asserted in an E2E.
2. **`navigator.onLine` lying.** It reports an interface, not reachability — routinely true on a train with no signal. Mitigation: a heartbeat endpoint with a 4s abort.
3. **Untranslated keys reaching a traveler.** Mitigation: English messages merged underneath every locale, so a missing key renders English rather than `home.title`.

## Testing strategy
Vitest for `getI18n` fallback behaviour. Playwright: locale redirect, nav rendering and current-page marking, manifest validity (standalone, theme, maskable icon), the worker's SKIP_WAITING contract, English fallback on `/te`, 404 on an unsupported locale, and axe.

## Acceptance criteria
- [x] `/` redirects to a locale-prefixed URL; `/te` renders with `lang="te"` and English fallback text.
- [x] Manifest is installable: standalone, brand theme, maskable icon.
- [x] Service worker waits rather than taking over.
- [x] Offline banner reflects real reachability, and says when the saved information is from.
