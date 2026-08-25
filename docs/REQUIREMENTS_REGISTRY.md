# Mandhira — Requirements Registry

Every meaningful requirement from `PRD.md` and `TRD.md`, with stable IDs. **No requirement may disappear during development.**

- **Implementation status: `NOT_STARTED` for every requirement in this file** (live status tracked per-requirement in `PROJECT_STATUS.md`; update both on change).
- Source is encoded in the ID prefix (PRD-/TRD-). Priority: **P0** = launch-blocking for its milestone, **P1** = required for the complete product, **P2** = M5/expansion.
- Acceptance criteria are abbreviated here; the authoritative acceptance text is the referenced PRD/TRD section.

## PRD — Principles (apply to every feature; violations block merge)
| ID | Name | Description / Acceptance | Priority | Deps |
|---|---|---|---|---|
| PRD-PRIN-001 | User defines what matters | Priority tiers user-set; system never infers spiritual importance (PRD §2.1) | P0 | — |
| PRD-PRIN-002 | NOW/NEXT/LATER | In-journey UX reduces to three questions; no calendar grid in Live mode | P0 | — |
| PRD-PRIN-003 | Adapt to reality | Changes produce explained options; plans never silently rewritten | P0 | — |
| PRD-PRIN-004 | Trusted information | Source/verification/freshness/confidence visible; no false confidence | P0 | — |
| PRD-PRIN-005 | Explain, don't mystify | Every recommendation ships a one-sentence "because" | P0 | — |
| PRD-PRIN-006 | Human control | No state-changing journey action without explicit user tap | P0 | — |

## PRD-KNOW — Knowledge Model (PRD F1)
| ID | Name | Description / Acceptance | Priority | Deps |
|---|---|---|---|---|
| PRD-KNOW-001 | Entity model | Destination/Place/Experience/Availability/Route/Transport/Facility/Accessibility/Guidance/Media/Phrase per F1 tables; 50 places+120 experiences per destination without schema change. **Implemented (B-004):** all §4.4 tables created. | P0 | — |
| PRD-KNOW-002 | Trust record on every entity & critical field | Fields per F1: source tier T1–T5, verification status, verified_at/by, valid_until, freshness, confidence, conflict_flag | P0 | KNOW-001  **Implemented (B-011):** inline trust panel on every critical field; freshness/confidence derived by the database and shown read-only. |
| PRD-KNOW-003 | Publish gate | `unverified`/`ai_extracted` never visible to travelers; minimum `human_reviewed`. **Implemented (B-004):** enforced inside the `v_published_*` views by `critical_fields_gated()`; a missing trust record also fails the gate. Covered by pgTAP. | P0 | KNOW-002 |
| PRD-KNOW-004 | Critical-field independence | Timings/availability/closures/requirements carry their own trust records | P0 | KNOW-002 |
| PRD-KNOW-005 | Locale fallback | Missing locale falls back to en with visible "Not yet available in [language]" | P0 | KNOW-001 |
| PRD-KNOW-006 | Freshness computation | fresh ≤90d, aging 91–180d, stale >180d/expired; confidence matrix per F1 | P0 | KNOW-002 |

## PRD-DISC — Discovery (F2)
| ID | Name | Description / Acceptance | Priority | Deps |
|---|---|---|---|---|
| PRD-DISC-001 | Home | Search + Plan CTA + continue card + ≤3 relevant destination cards | P0 | KNOW-003 |
| PRD-DISC-002 | Destination page | Section order per F2 incl. Sources & freshness footer | P0 | KNOW-003 |
| PRD-DISC-003 | Experience card | Name, significance line, plain-language availability, duration, booking flag, accessibility icons, trust badge | P0 | KNOW-003 |
| PRD-DISC-004 | Add-to-journey | Single action; default tier IMPORTANT with tier picker in same sheet | P0 | PLAN-002 |
| PRD-DISC-005 | Filters | Exactly 6: type, availability-on-dates, accessibility, duration, booking, near-added | P0 | — |
| PRD-DISC-006 | Journey-aware ranking | Active journey → "fits your journey" first | P1 | PLAN-001 |
| PRD-DISC-007 | Anti-feed rules | ≤20 cards/section then See-all; no reviews/ratings/trending; editorial weight ranks | P0 | — |
| PRD-DISC-008 | 60-second comprehension | Top-3 significance + availability + booking discoverable in ≤60 s, ≤3 screens (usability test) | P0 | DISC-002 |

## PRD-INT — Intent Capture (F3)
| ID | Name | Description / Acceptance | Priority | Deps |
|---|---|---|---|---|
| PRD-INT-001 | NL input → Journey Brief | Single text box; extract destination/dates/travelers/must-do/fixed/preferences per F3 table | P0 | KNOW-003 |
| PRD-INT-002 | Structured form alternative | ≤5 screens; skip allowed except destination+dates | P0 | — |
| PRD-INT-003 | Suggested-value confirmation | Inferred values labelled Suggested; tap to confirm; never auto-must-do | P0 | INT-001 |
| PRD-INT-004 | Clarifying questions | Ambiguities surfaced as questions in the brief | P0 | INT-001 |
| PRD-INT-005 | ID grounding | Named-but-unknown experiences → "no verified information yet" + closest matches; zero invented entries | P0 | TRD-AI-002 |
| PRD-INT-006 | Extraction quality | ≥85% field accuracy per launch language on test set; 100% hallucination block | P0 | INT-001 |

## PRD-PLAN — Journey Builder (F4)

> ✅ = implemented and verified in B-019 (docs/plans/PLAN-02.md §9). PRD-PLAN-001 is
> partially met: the day timeline exists, drag-and-drop is deferred. PRD-PLAN-004 (prep
> propagation) is B-021; PRD-PLAN-007 is M2. PRD-PLAN-009 is measured at p50 119 ms /
> p95 199 ms on localhost and must be re-measured on a deployed stack at B-025.
| ID | Name | Description / Acceptance | Priority | Deps |
|---|---|---|---|---|
| PRD-PLAN-001 | Journey/day/item model | Item types experience/travel_leg/rest/meal/fixed_commitment/free_time; day timeline view | P0 | KNOW-001 |
| PRD-PLAN-002 ✅ | Priority tiers + engine rules | FIXED never moved/removed; PROTECTED never removed, move only with confirmation; IMPORTANT move/swap with confirmation; OPTIONAL removed first, always asked | P0 | ENG-001 |
| PRD-PLAN-003 ✅ | Item actions | Tier change, move, preferred window, dependency ("after X"), note, remove | P0 | PLAN-001 |
| PRD-PLAN-004 | Prep propagation | Experience requirements auto-generate Prepare tasks | P0 | PREP-001 |
| PRD-PLAN-005 ✅ | Buffers | Visible/editable; 15 min base; ×1.5 senior/limited_walking; ×2 wheelchair/needs_rest | P0 | ENG-001 |
| PRD-PLAN-006 ✅ | Return guard | Last FIXED anchored; breach → Broken; engine blocks breaching plans | P0 | ENG-001 |
| PRD-PLAN-007 | Simplify-this-day | Proposes OPTIONAL removal then IMPORTANT moves as change card; never auto-applies | P1 | ADPT-001 |
| PRD-PLAN-008 ✅ | No auto-fill | Builder always starts from the brief; no "fill my day" | P0 | — |
| PRD-PLAN-009 | Builder performance | 3-day/12-item journey built+retiered ≤5 min mobile; Health updates ≤500 ms | P0 | ENG-002 |
| PRD-PLAN-010 ✅ | Traveler group model | 1–12 travelers; attributes mobility/age_band/dietary/locale; journey prefs pace/structure/walking/transport/day window | P0 | ACCT-003 |

## PRD-HLTH — Feasibility & Health (F5)
| ID | Name | Description / Acceptance | Priority | Deps |
|---|---|---|---|---|
| PRD-HLTH-001 | Five checks | Time load, availability fit, dependency fit, physical load, trust exposure | P0 | ENG-002 |
| PRD-HLTH-002 | Four states + copy | Comfortable ≤80%; Tight ≤100%; At Risk ≤+60 min or flags; Broken >+60/PROTECTED-FIXED infeasible/return breach; exact display strings per F5 | P0 | HLTH-001 |
| PRD-HLTH-003 | Causes in plain language | Every non-Comfortable state lists ≥1 concrete cause; trust exposure as separate line | P0 | HLTH-001 |
| PRD-HLTH-004 | Likely vs worst-case | Health uses likely durations; max durations for worst-case preview; no numeric score shown | P0 | — |
| PRD-HLTH-005 | Physical-load defaults | limited_walking 2,000 m/day; wheelchair step-free only; rest ≥10 min/90 min | P0 | PLAN-010 |

## PRD-ADPT — Adaptive Replanning (F6)
| ID | Name | Description / Acceptance | Priority | Deps |
|---|---|---|---|---|
| PRD-ADPT-001 | Trigger set | 8 trigger classes per F6 table (user late/done-delta/stay-longer/knowledge/transport/weather/add-remove/preferences) | P0 | LIVE-003 |
| PRD-ADPT-002 | Option ladder | Fixed order a–f; stop at Tight-or-better; never remove PROTECTED, never move FIXED | P0 | HLTH-002 |
| PRD-ADPT-003 | Option ranking | More PROTECTED kept → fewer removals → fewer moves → less travel | P0 | ADPT-002 |
| PRD-ADPT-004 | Change Card contract | What changed / Why it matters / Recommended+because / ≤2 others / Keep-as-is with resulting state; before/after times per affected item | P0 | ADPT-002 |
| PRD-ADPT-005 | Consent | Nothing applied without a tap; no_impact → quiet toast only | P0 | PRIN-006 |
| PRD-ADPT-006 | Low-confidence disclosure | Cards triggered by knowledge/live changes show trust badge; low confidence adds "check locally" line | P0 | KNOW-002 |
| PRD-ADPT-007 | Offline user-triggers | Late/done/stay replanning works offline from cached knowledge; external triggers queue | P1 | OFFL-005 |
| PRD-ADPT-008 | Matrix acceptance | 50 journeys × 8 triggers: option restoring Tight+ whenever mathematically possible; zero forbidden moves | P0 | ADPT-002 |

## PRD-PREP — Prepare (F7)
| ID | Name | Description / Acceptance | Priority | Deps |
|---|---|---|---|---|
| PRD-PREP-001 | Auto checklist | Groups: bookings/documents/carry/know/travelers/downloads; deduplicated; trust badge + Why? per item | P0 | PLAN-004 |
| PRD-PREP-002 | Booking deadlines | Dated tasks with how-to text; notifications 7d & 1d | P0 | NOTF-001 |
| PRD-PREP-003 | Booked-slot promotion | User enters booked time → item becomes FIXED with confirmation | P1 | PLAN-002 |
| PRD-PREP-004 | Journey Summary | Shareable read-only + printable; one A4/day; excludes traveler profiles/notes | P0 | SHARE-001 |

## PRD-LIVE — Live Journey (F8)
| ID | Name | Description / Acceptance | Priority | Deps |
|---|---|---|---|---|
| PRD-LIVE-001 | Activation | Auto on day start or "Start today" | P0 | PLAN-001 |
| PRD-LIVE-002 | NOW card | Item, place, what-to-do, time guidance, practical chips, phrase shortcut; exactly 3 actions Done/Late/Stay | P0 | ENG-004 |
| PRD-LIVE-003 | NEXT + LATER | Leave-by time, travel leg, Navigate hand-off; LATER compact with tier chips | P0 | ENG-004 |
| PRD-LIVE-004 | Health pill + travel/free-time states + end-of-day card | Per F8 | P0 | HLTH-002 |
| PRD-LIVE-005 | 5-second comprehension | What/when/where in ≤5 s; ≥90% task success n≥10 | P0 | LIVE-002 |
| PRD-LIVE-006 | Constraints | No calendar grid; ≤3 actions/card; timing badges on long-press | P0 | — |

## PRD-TRST — Trust Layer UI (F9)
| ID | Name | Description / Acceptance | Priority | Deps |
|---|---|---|---|---|
| PRD-TRST-001 | Badge vocabulary | ✓ Verified / ◐ Verified earlier / ! Check locally mapped from confidence per F9 | P0 | KNOW-006 |
| PRD-TRST-002 | Trust sheet | Source name + tier-in-words, last confirmed, valid until, conflict note, Report button; ≤1 tap | P0 | TRST-001 |
| PRD-TRST-003 | Sources & freshness footer | All sources + oldest verification date per page | P0 | — |
| PRD-TRST-004 | Stale in-journey note | One-time note on stale critical fields in active journeys | P1 | KNOW-006 |
| PRD-TRST-005 | Honesty rules | No percentages; low-confidence badges never hidden; AI text labelled "Mandhira summary", never Verified | P0 | — |
| PRD-TRST-006 | Coverage | 100% published critical fields render a badge | P0 | TRST-001 |

## PRD-DYN — Live & Dynamic Info (F10)
| ID | Name | Description / Acceptance | Priority | Deps |
|---|---|---|---|---|
| PRD-DYN-001 | Three visible categories | Verified / "Updated [date]" dynamic / "Live · provider · as of" | P1 | TRST-001 |
| PRD-DYN-002 | Feed registry | Per-destination provider, refresh interval, fallback config | P1 | OPS-SRC-001 |
| PRD-DYN-003 | Outage fallback | "Live update unavailable — last known (as of)" ≤60 s; badge → Check locally | P1 | DYN-001 |
| PRD-DYN-004 | Feed→journey triggers | Live changes affecting items raise ADPT triggers | P1 | ADPT-001 |
| PRD-DYN-005 | Launch feeds | Weather + ≥1 transport feed for launch destinations | P1 | DYN-002 |

## PRD-OFFL — Offline (F11)
| ID | Name | Description / Acceptance | Priority | Deps |
|---|---|---|---|---|
| PRD-OFFL-001 | Auto snapshot | Journey + referenced knowledge + guidance + phrase packs + facility essentials on create/edit/open | P0 | PLAN-001 |
| PRD-OFFL-002 | Offline read set | Live Journey fully, Prepare, saved pages, trust sheets; indicator "Offline — saved info (as of)" | P0 | OFFL-001 |
| PRD-OFFL-003 | Reconnect reconciliation | Silent sync; single "updated while offline" card when active journey affected; no sync-error dialogs; user-edit LWW, knowledge server-wins | P0 | OFFL-001 |
| PRD-OFFL-004 | Queued writes | Reports and item-status queue offline, send on reconnect | P1 | OFFL-001 |
| PRD-OFFL-005 | Offline replanning | User-initiated triggers replans from cache | P1 | ADPT-002 |
| PRD-OFFL-006 | Map tiles (deferred) | 5 km default/15 km expandable; Downloads shows size+update | P2 | MAPS-001 |
| PRD-OFFL-007 | Airplane-mode acceptance | Full 3-day journey readable+ (M3: replannable); reconcile ≤30 s, zero loss | P0 | OFFL-002 |

## PRD-LANG — Multilingual & Phrases (F12)
| ID | Name | Description / Acceptance | Priority | Deps |
|---|---|---|---|---|
| PRD-LANG-001 | Locale system | First-launch + settings; applies to UI/content/guidance/notifications/AI | P0 | — |
| PRD-LANG-002 | Locale-as-data | Adding a language = locale row + translations; zero front-end code change | P0 | LANG-001 |
| PRD-LANG-003 | Launch locales | en/te/hi complete for launch destinations | P1 | OPS-CNT-004 |
| PRD-LANG-004 | Phrase assistance | Context-tagged; local text + transliteration + user language; audio; "Show to someone" mode | P1 | KNOW-001 |

## PRD-ACCT — Accounts & Personalization (F13)
| ID | Name | Description / Acceptance | Priority | Deps |
|---|---|---|---|---|
| PRD-ACCT-001 | Auth methods | Magic link primary, Google secondary; guest mode; draft migrates on sign-in; model extensible to phone/social later | P0 | —  **Implemented (B-007):** magic link + Google per D-009 (no phone/SMS in M1); guest browsing needs no account; draft claim-on-sign-in wired in B-019. |
| PRD-ACCT-002 | Profile | Name, locale, notification prefs, journeys by status, saved places | P0 | ACCT-001 |
| PRD-ACCT-003 | Traveler profiles | Label/mobility/age_band/dietary/locale; owner-only sensitivity | P0 | PRIV-002 |
| PRD-ACCT-004 | Explicit-signal personalization | Only explicit signals; "Because you protected X" explanations; no dwell-time inference | P1 | — |
| PRD-ACCT-005 | Multi-device sync | Second device shows state ≤10 s; latest-edit wins | P1 | ACCT-001 |

## PRD-REPT — User Reports (F14)
| ID | Name | Description / Acceptance | Priority | Deps |
|---|---|---|---|---|
| PRD-REPT-001 | Report creation | From trust sheet/place/NOW; 6 types; ≤500 chars; auto-context; consented journey link | P1 | TRST-002 |
| PRD-REPT-002 | Signal-not-truth | T5; never auto-published; enters Ops queue | P0 | OPS-WF-005 |
| PRD-REPT-003 | Resolution loop | User notified Updated/Confirmed/Couldn't verify | P1 | NOTF-001 |
| PRD-REPT-004 | Auto-downgrade | 3 independent reports/14 d → Check locally until resolved | P1 | KNOW-006 |
| PRD-REPT-005 | Photo attachment | Optional photo (deferred to M4); offline queue per OFFL-004 | P2 | OFFL-004 |

## PRD-NOTF — Notifications (F15)
| ID | Name | Description / Acceptance | Priority | Deps |
|---|---|---|---|---|
| PRD-NOTF-001 | Type set + defaults | 7 types per F15 table; all switchable; suggestions default off | P1 | ACCT-002 |
| PRD-NOTF-002 | Leave-by local | 15 min before travel legs; works offline (local scheduling) | P1 | LIVE-003 |
| PRD-NOTF-003 | Restraint | ≤1 non-journey notification/week; zero marketing; PRD §12.7 tone | P0 | — |

## PRD-CMPL — Complete & Reflect (F16)
| ID | Name | Description / Acceptance | Priority | Deps |
|---|---|---|---|---|
| PRD-CMPL-001 | Journey Record | Done-tap timeline; planned vs completed; protected completion plain statement (no score) | P1 | LIVE-002 |
| PRD-CMPL-002 | Reflection | 3 optional questions; private; third offers report creation | P1 | REPT-001 |
| PRD-CMPL-003 | Plan-similar | Copies travelers/preferences/tiers into new brief | P1 | INT-001 |
| PRD-CMPL-004 | No social | Share summary is the only share surface, opt-in | P0 | — |

## PRD-OPS — Admin & Data Operations (F17–F20)
| ID | Name | Description / Acceptance | Priority | Deps |
|---|---|---|---|---|
| PRD-OPS-SRC-001 | Source registry | Types/tiers T1–T5, coverage, cadence, method, owner, status | P0 | —  **Implemented (B-011):** O08 registry with type/tier/cadence/status; manual method only in M1 (other methods arrive with B-029). |
| PRD-OPS-SRC-002 | Ingestion + captures + diffs | Raw capture stored; diff vs previous per run | P1 | OPS-SRC-001 |
| PRD-OPS-SRC-003 | AI extraction (ops) | Per-field confidence + verbatim excerpt; always `ai_extracted`; cannot publish | P1 | TRD-AI-004 |
| PRD-OPS-SRC-004 | Change detection | Monitored diff on published field → Change candidate ≤1 cycle with excerpt | P1 | OPS-SRC-002 |
| PRD-OPS-SRC-005 | Conflict auto-detection | ≥2 sources ≤T3 disagree → Conflict opened | P1 | OPS-SRC-002 |
| PRD-OPS-WF-001 | Review queue | Side-by-side proposed/current + excerpt; accept/edit/reject/request-verify | P1 | OPS-SRC-003 |
| PRD-OPS-WF-002 | Verify queue | Evidence attach; verified_at/valid_until | P0 | KNOW-002 |
| PRD-OPS-WF-003 | Conflict resolution | Winner/both-valid-with-context/escalate; clears flag with reason | P1 | OPS-SRC-005 |
| PRD-OPS-WF-004 | Approve & publish | Entity diff + validation + affected-journey count + notification preview; validation rules per F18 block publish naming the field | P0 | KNOW-003  **Implemented (B-012):** `validate_for_publish()` returns per-field problems; the Approve queue and entity panel render the same list the gate enforces. Affected-journey counts wait for journeys to exist (B-019+). |
| PRD-OPS-WF-005 | Reports queue | Grouped by entity/field with counts; triage to verify or close with user outcome | P1 | REPT-002 |
| PRD-OPS-WF-006 | Freshness monitor | Filters stale/aging/expiring-30/low/conflict; bulk reverify assignment | P1 | KNOW-006 |
| PRD-OPS-WF-007 | Impact before publish | Affected active/upcoming journey count + preview; publish raises ADPT triggers | P1 | ADPT-001 |
| PRD-OPS-WF-008 | Audit & versions | Who/when/what/why + previous value; any version restorable by Admin | P0 | — |
| PRD-OPS-WF-009 | RBAC + separation of duties | 9 roles; reviewer ≠ approver on same change | P0 | AUTH  **Implemented (B-007):** enforced by a `review_tasks` trigger against the last `entity_versions.changed_by` (D-037), with pgTAP coverage.  **Enforced twice (B-007 trigger, B-012 publish_entity):** the person who last changed an entity cannot publish it; covered by pgTAP and an E2E. |
| PRD-OPS-WF-010 | Ops throughput | New destination (≥30–40 places) draft→published ≤5–10 working days by ≤3 people | P1 | OPS-WF-004 |
| PRD-OPS-CNT-001 | Structured entity editors | All F1 entities; no free-form HTML on critical fields; inline trust panel; preview-as-app | P0 | KNOW-001 |
| PRD-OPS-CNT-002 | Relationships & circuits | Place↔experience↔route↔facility links; nearby curation; circuit builder; editorial weight 1–5 | P1 | OPS-CNT-001 |
| PRD-OPS-CNT-003 | Media library | Upload/crop presets/caption-per-locale/credit/licence/usage list | P0 | — |
| PRD-OPS-CNT-004 | Translation workspace | Side-by-side; AI drafts flagged; translator confirms; completeness dashboard; locale add; phrase editor + audio | P1 | LANG-002 |
| PRD-OPS-MON-001 | Knowledge health dashboard | Freshness %, conflicts, queue ages, reports, locale completeness, depth per destination | P1 | OPS-WF-006 |
| PRD-OPS-MON-002 | Product signals | Aggregated privacy-safe metrics per F20/PRD §7 | P1 | ANLY-001 |
| PRD-OPS-MON-003 | Admin tools | Users/roles, source admin, feature flags per destination, advisories with dates | P1 | OPS-WF-009 |

## PRD-DSGN / PRD-PRIV / PRD-ANLY (PRD §10–§12)
| ID | Name | Description / Acceptance | Priority | Deps |
|---|---|---|---|---|
| PRD-DSGN-001 | Design tokens | Exact palette/tiers/status colors PRD §12.1; light+dark; ≥4.5:1. **RESOLVED 2026-08-25 (OPEN-008 → D-025):** the original §12.1 light palette had 17 sub-AA pairings; revised values now pass on every pair in both modes, verified programmatically and by axe on both shells. `brand.primary` #FF660E unchanged; brand-coloured text uses the new `brand.primary.text` token. | P0 | — |
| PRD-DSGN-002 | Typography | Inter/Fraunces/Noto Telugu/Devanagari; scale §12.2; 200% text scale | P0 | — |
| PRD-DSGN-003 | Component library | §12.5 list incl. Change Card, NOW card, trust badge, health pill. **Partially implemented (B-002):** 13 of 15 §12.5 components shipped in `packages/ui`, presentational-only (D-021). Ops data table delivered in B-008; Ops side-by-side review → B-012 (D-022). | P0 | DSGN-001 |
| PRD-DSGN-004 | Motion | Durations/easing §12.6; reduce-motion honored. **Implemented (B-002):** duration/easing tokens in `tokens.css`, collapsed to 0 ms under `prefers-reduced-motion`. | P1 | — |
| PRD-DSGN-005 | Voice | §12.7 rules + reference strings; forbidden vocabulary enforced in copy review | P0 | — |
| PRD-DSGN-006 | Accessibility | WCAG 2.2 AA; 44 px targets; icon+text status everywhere. **Partially implemented (B-002):** icon+text enforced by unit tests on every tier/trust/health state; 44 px minimums on interactive controls; axe smoke green on both shells except the OPEN-008 contrast pairs. | P0 | — |
| PRD-PRIV-001 | Data minimisation | Only feature-necessary data; individual deletability | P0 | — |
| PRD-PRIV-002 | Sensitive traveler attributes | Mobility/age never to Ops/exports/analytics/targeting | P0 | ACCT-003  **Implemented (B-006):** `traveler_profiles` is owner-only with NO ops policy of any kind; a pgTAP test asserts an admin sees zero rows, and was verified to fail when a leaking policy is added. |
| PRD-PRIV-003 | Location discipline | On-device, Live-mode-only; no server location history; background off by default | P0 | LIVE-001 |
| PRD-PRIV-004 | Children | Label+band only; no under-18 accounts | P0 | — |
| PRD-PRIV-005 | DPDP rights | Export JSON; delete ≤30 d; consent notice; grievance contact | P1 | ACCT-002 |
| PRD-PRIV-006 | Report privacy | Pseudonymised reporter; restricted roles | P1 | REPT-001 |
| PRD-ANLY-001 | Privacy-safe instrumentation | PRD §7 metrics instrumented; zero user identifiers (schema-tested) | P1 | — |

## TRD — Architecture & Platform
| ID | Name | Description / Acceptance | Priority | Deps |
|---|---|---|---|---|
| TRD-ARCH-001 | Monorepo layout | pnpm+turbo; apps web/ops; packages ui/db/journey-engine/providers/i18n/config | P0 | — |
| TRD-ARCH-002 | Pure Journey Engine | No I/O; KnowledgeBundle input = Dexie snapshot byte-for-byte; deterministic; browser+server identical | P0 | — |
| TRD-ARCH-003 | Provider abstraction | Ai/Routing/Geocoding/Weather/Email/Push interfaces; no vendor SDK outside packages/providers (lint-enforced) | P0 | — |
| TRD-ARCH-004 | Published-views-only | Traveler reads exclusively `v_published_*` with aggregated trust jsonb. **Implemented (B-004):** 9 views; anon holds no grant on base tables and RLS is on, so the gate is structural. Critical-field trust >= human_reviewed enforced per entity. | P0 | TRD-DB-003 |
| TRD-ARCH-005 | Offline-first read path | Dexie-first + SWR revalidate; React Query persistence | P0 | — |
| TRD-ARCH-006 | Stack pins | Next 15/React 19/TS strict/Tailwind 4/shadcn/TanStack Query 5/Dexie 4/Zustand 5/Serwist/next-intl/date-fns per TRD §3 | P0 | — |
| TRD-DB-001 | Schema-as-migrations | All §4 tables/enums/views/triggers from `supabase/migrations`; `db reset` clean; generated types only. **Implemented (B-003+B-004):** §4.1–§4.7 across `0001`–`0006` plus `0007_published_views.sql`; 51 tables, 9 published views, `db reset` clean and CI-enforced. Generated types implemented (B-005): `packages/db/types.ts` via `pnpm db:types`, staleness enforced in CI. | P0 | — |
| TRD-DB-002 | Naming & conventions | snake_case; uuid pks; `_i18n` jsonb; created/updated_at triggers; soft-delete where specified. **Implemented for §4.2/§4.3 (B-003):** all 26 enums pinned by a pgTAP contract test; a pgTAP test also fails any table that has `updated_at` without its trigger. | P0 | — |
| TRD-DB-003 | RLS complete | §4.9 matrix; automated RLS tests; anon/traveler/ops separation; service-role server-only | P0 | AUTH  **Implemented (B-006):** `0008_rls_policies.sql` implements the full §4.9 matrix with `has_role()`/`has_any_role()`/`is_ops()`/`owns_journey()` helpers; 33 pgTAP role tests incl. IDOR cases. Grants and policies are both required and both present. |
| TRD-DB-004 | Versioning triggers | entity_versions on every knowledge table; audit_log on ops mutations. **Implemented for knowledge (B-004):** `record_entity_version()` attached to all 11 publishable/trust-bearing tables, with a pgTAP test that fails if any table carrying a publish status lacks it. Ops audit triggers → B-012. | P0 | — |
| TRD-DB-005 | Geo & search infra | PostGIS points+GiST; tsvector generated columns; embedding vector(768) columns ready. **Implemented (B-004):** GiST on `places.location`/`destinations.centre`, GIN tsvector + pg_trgm on names, `embedding vector(768)` on destinations/places/experiences. `search_tsv` is locale-agnostic via `i18n_text()`, so te/hi are searchable without a migration. | P0 | — |
| TRD-DB-006 | Forward-only migrations | Additive; never drop columns in same release as code stops using them | P0 | — |
| TRD-API-001 | Response envelope & validation | `{ok,data}|{ok,error{code,message}}`; Zod on all inputs; no stack traces. **Partially implemented (B-005):** Zod schemas for places, experiences, availability_rules, journeys, journey_items in `@mandhira/db`, pinned to the generated enums at compile time. Envelope + `withApi` wrapper → first route handler (B-007/B-018). | P0 | — |
| TRD-API-002 | Traveler API surface | Routes per TRD §5.2 exactly (names verbatim) | P0 | — |
| TRD-API-003 | Ops API surface | Routes per §5.3; role-gated server-side | P0 | TRD-DB-003 |
| TRD-API-004 | Background jobs | 8 jobs per §5.4 with stated schedules incl. keepalive & deletion | P0 | — |
| TRD-API-005 | Degradation matrix | §5.5 behaviors implemented per dependency | P0 | — |
| TRD-ENG-001 | Engine function set | 10 functions per §5.1 signatures | P0 | TRD-ARCH-002 |
| TRD-ENG-002 | Engine test bar | ≥90% coverage; Appendix A fixture passes; ≤500 ms p95/60 items; Web Worker >40 items | P0 | ENG-001 |
| TRD-AI-001 | AI provider config | Vercel AI SDK; env-switchable models; fallback provider chain | P0 | TRD-ARCH-003 |
| TRD-AI-002 | Grounding in code | `assertGrounded()`; ID-constrained schemas; excerpt-match filter for extraction | P0 | — |
| TRD-AI-003 | AI write boundary | AI writes only ai_extractions/change_candidates/ai_draft translations | P0 | — |
| TRD-AI-004 | AI observability & cache | ai_calls log (no user ids); 24 h ai_cache; 12 s timeout+retry+fallback | P0 | — |
| TRD-SEC-001 | Rate limits | §6.2 table via rate_limits helper; 429 + Retry-After | P0 | — |
| TRD-SEC-002 | Headers & CSP | §6.1 CSP; storage bucket policies; signed URLs 15 min | P0 | — |
| TRD-SEC-003 | Secrets & audit hygiene | Env-only secrets; .env.example; ip_hash salted; pnpm audit in CI | P0 | — |
| TRD-SEC-004 | Share-token safety | 32-byte, expiring, revocable; excludes profiles/notes | P0 | — |
| TRD-PERF-001 | M1 targets | LCP ≤3.0 s ref-device; ≤180 kB route JS; Live-from-cache ≤800 ms; Lighthouse ≥80/95/installable | P0 | — |
| TRD-PERF-002 | Production targets | TRD §9 production column + 99.5% availability | P1 | PERF-001 |
| TRD-PERF-003 | Mandated techniques | RSC-first, dynamic imports, font subsetting, virtualisation, memoized timeline, worker offload | P0 | — |
| TRD-DEPL-001 | Environments & CI/CD | §8 steps 1–7; migration job gates deploy; preview strategy | P0 | — |
| TRD-DEPL-002 | PWA release discipline | Version bump → update toast; never force-reload during Live mode | P0 | — |
| TRD-DEPL-003 | Backup & rollback | Nightly encrypted pg_dump until Pro; Vercel instant rollback; runbook | P0 | — |
| TRD-OBSV-001 | Sentry + analytics events | Both apps; allowlisted event names; queue-age alerts | P1 | — |
| TRD-COST-001 | Cost controls | Quota alerts at 70%; caches per §10; $0 M1 infra | P1 | — |

**Registry totals: 132 requirements** (PRD 95 / TRD 37). Phase-18 cross-check: every PRD F1–F20 feature, principle, privacy rule, and design mandate above; every TRD section §2–§12 represented. Any newly discovered requirement must be added here with the next free ID — never tracked ad hoc.
