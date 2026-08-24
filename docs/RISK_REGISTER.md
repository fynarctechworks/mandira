# Risk Register

Probability/Impact: L/M/H. Status: OPEN unless noted. Review at every milestone exit.

| ID | Risk | Type | P | I | Mitigation | Status |
|---|---|---|---|---|---|---|
| R-001 | Solo bandwidth: 110–120 focused dev days + content ops; timeline slips or quality drops | Development | H | H | Strict backlog order; vertical slice first; content parallelisable via Ops roles; no scope additions without registry entry | OPEN |
| R-002 | Content operations underestimated: Day-8 "seed destination" realistically 2–3+ days; T1/T2 sourcing slow | Data | H | H | Budget content time separately (backlog B-013 note); AI extraction lands M3 to accelerate; recruit a content contributor early | OPEN |
| R-003 | Knowledge licensing/ToS: scraping official sites for ingestion may violate terms; media licensing gaps | Legal/Data | M | H | Source registry records terms; prefer official data/permission; media requires licence field before publish (validation rule); legal review before M3 URL-monitoring at scale | OPEN |
| R-004 | AI extraction/intent quality in Telugu/Hindi below the 85% bar on Gemini | Technical | M | M | Eval fixtures per locale before launch (OPEN-004); provider swap is env-level (D-006); structured form is a full fallback | OPEN |
| R-005 | ORS/OSM routing quality in Indian pilgrimage towns (footpaths, hill routes) misleads travel legs | Integration | M | H | Ops-curated `routes`/`transport_connections` override computed estimates; label computed values "estimated"; Google Routes swap path budgeted ($50/mo) | OPEN |
| R-006 | Supabase free-tier: 7-day pause, 500 MB DB, no PITR | Infra | M | M | keepalive cron; nightly pg_dump artifact; upgrade trigger documented (first paid line) | OPEN |
| R-007 | iOS PWA limitations: push requires installed 16.4+, storage eviction can wipe Dexie | Technical | M | M | In-app notifications as fallback; `navigator.storage.persist()`; re-snapshot on open; Expo shell path preserved (M5) | OPEN |
| R-008 | RLS complexity: a policy gap leaks journeys or traveler_profiles | Security | M | H | RLS test matrix in CI from M0 (B-006); traveler_profiles has no ops policy by construction; review checklist item | OPEN |
| R-009 | Engine correctness: option-ladder/tier bugs erode the core promise (e.g., removing a PROTECTED item) | Architecture | M | H | ≥90% coverage gate; property-style matrix tests (50 journeys × 8 triggers); forbidden-move assertions in every ladder test | OPEN |
| R-010 | Scope creep back toward "generic travel app" or feature additions bypassing registry | Product | M | M | CLAUDE.md conflict/ambiguity stop rule; PRD §2 decision test in every plan; registry-first rule | OPEN |
| R-011 | Free-tier quota exhaustion (Gemini RPD, ORS 2k/day, MapTiler 100k) causing silent degradation | Integration | M | M | ai_cache + travel_estimates cache; 70% quota alerts; degradation matrix labels honestly | OPEN |
| R-012 | KnowledgeBundle drift: view/schema change breaks offline snapshots on users' devices | Architecture | M | H | Dexie schema versioning + migration on open; view-shape changes gated by DECISION_LOG rule (D-010) | OPEN |
| R-013 | Trust-model theater: badges everywhere but verification backlog grows stale, creating false confidence | Data/Product | M | H | Freshness monitor + queue-age alerts (M3); stale auto-downgrades badges regardless of Ops attention; report threshold auto-downgrade | OPEN |
| R-014 | Pilot recruitment: <10 real planners for M2 exit invalidates acceptance | Development | M | M | Recruit from personal/Stimuli IQ network during M1; pilot destination chosen where testers actually travel (OPEN-001) | OPEN |
