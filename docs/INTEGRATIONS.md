# Integrations

All behind `packages/providers` interfaces (TRD-ARCH-003). Adding/attempting a provider = DECISION_LOG entry.

| Capability | Interface | Initial provider | Fallback (TRD §5.5) | Notes |
|---|---|---|---|---|
| AI (intent, explain, extract, translate, classify, embed) | `AiProvider` | Gemini (`gemini-2.5-flash` structured, `-lite` fast) | Anthropic → deterministic templates/structured form | Env-switchable (TRD §7.1); ai_cache 24 h; grounding enforced in code |
| Routing / travel time | `RoutingProvider` | OpenRouteService (2k/day) | `travel_estimates` cache → PostGIS straight-line × mode factor, labelled "estimated" | Cache-first mandatory |
| Geocoding (Ops) | `GeocodingProvider` | Nominatim | manual pin | Respect usage policy: 1 rps, UA header |
| Map tiles | (client config) | MapTiler free | place list + Open-in-Maps | PMTiles self-host path for offline (M5) |
| Weather (live) | `WeatherProvider` | Open-Meteo | last-known + "unavailable" label | No key |
| Transport feeds | `LiveFeedProvider` (per-destination config) | TBD per launch destination | last-known label; badge → Check locally | OPEN-002 in readiness report |
| Email | `EmailProvider` | Resend (SMTP for Supabase Auth + transactional) | retry + Google sign-in path | Verified domain required |
| Push | `PushProvider` | web-push (VAPID) | in-app notifications list | iOS requires installed PWA 16.4+ |
| Navigation hand-off | deep link util | geo:/Google Maps URL scheme | copyable address | Not a provider; no SDK |
| Error tracking | — | Sentry | console + Vercel logs | Free tier |

Explicit non-integrations (PRD §8): payments, booking APIs as core flows, social platforms, ad networks.
