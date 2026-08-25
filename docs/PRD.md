# MANDHIRA — PRODUCT REQUIREMENTS DOCUMENT

**Version:** 1.0 · **Status:** Complete product specification (full vision, phased delivery) · **Owner:** Phani / Stimuli IQ Private Limited · **Date:** August 2026

> **How to read this document.** This PRD specifies the *complete* Mandhira ecosystem. It is written so that each feature has exact behaviour, exact data, and exact acceptance criteria, and so that an AI coding tool or an engineer can build any single section without re-deriving intent. Section 10 (Development Phases) defines the *order* in which it gets built. Nothing in a later phase reduces the scope of the product; it only sequences it.

---

## 📊 1. PROJECT OVERVIEW

| Item | Specification |
|---|---|
| Product name | Mandhira |
| One-line description | An intelligent pilgrimage travel platform that turns a traveler's intentions and priorities into a realistic, trusted, adaptive journey, and keeps it working when reality changes. |
| Ecosystem components | (1) **Mandhira App** — traveler product, mobile-first. (2) **Mandhira Ops** — admin, content, data, and operations platform, desktop-web. (3) **Knowledge Layer** — structured, source-attributed pilgrimage knowledge. (4) **Journey Engine** — priority, feasibility, and replanning logic. (5) **Intelligence Layer** — AI for intent understanding, search, explanation, and ops assistance. |
| Primary platform | Mandhira App: mobile-first, installable (works as native-quality mobile app and responsive web). Mandhira Ops: responsive web, optimised for ≥1280px desktop. |
| Launch languages | English (en) + Telugu (te) + Hindi (hi) at first public release; architecture supports any additional language by adding a locale pack, no redesign. |
| Offline | Core requirement. Any journey the user has opened is fully readable offline, including NOW/NEXT/LATER. |
| Accounts | Required for saving journeys; browsing and building a draft journey is allowed without an account (draft stored on device, migrated on sign-up). |
| Transactions | None in the core product. Integration points exist for partner services, but Mandhira does not process payments in any phase described here. |
| Primary brand color | `#FF660E` |
| Content scale | No hard limits. Knowledge model designed for thousands of destinations and hundreds of thousands of places/experiences, each with full trust metadata. |

### Key definitions used throughout

- **Destination** — a pilgrimage locality (e.g., a temple town or sacred region).
- **Place** — a physical location inside or near a destination (temple, shrine, ghat, viewpoint, facility).
- **Experience** — something a traveler can *do* (darshan, ritual, aarti, festival day, route walk, seva). An experience belongs to a place (or route) and has availability.
- **Journey** — a traveler's plan for one trip: dates, travelers, commitments, experiences, and priorities.
- **Item** — one entry inside a journey (an experience, a travel leg, a rest block, a fixed commitment).
- **Priority tier** — FIXED / PROTECTED / IMPORTANT / OPTIONAL, set by the user for every item.
- **Journey Health** — computed feasibility state of a journey: Comfortable / Tight / At Risk / Broken.
- **Trust record** — the source, verification, freshness, and confidence metadata attached to every fact.

---

## 🎯 2. PRODUCT VISION

**The user defines what matters. Mandhira helps make the journey work.**

Mandhira is a pilgrimage intelligence layer around the entire journey — before, during, and after. It is not a temple directory, a maps clone, a booking aggregator, a static itinerary generator, or a chatbot. Its value is that it understands how *priorities, timing, availability, travel, preparation, and real-world change* affect one person's specific journey, and it reduces the mental burden of managing that without taking decisions away from the traveler.

### The promise, in the user's words
- "I don't have to figure out everything by myself."
- "I know what matters in this journey, and what to focus on now."
- "If something changes, I have help — and I understand why it's recommending what it recommends."
- "I can trust where important information comes from."
- "I'm still the one deciding."

### Six non-negotiable principles (every feature is tested against these)
1. **User defines what matters** — every journey item carries a user-set priority tier; Mandhira never infers spiritual importance.
2. **NOW / NEXT / LATER** — in-journey experience shows three things, not a calendar.
3. **Adapt to reality** — a change never silently destroys a plan; it produces an explained set of options.
4. **Trusted information** — every important fact has a visible source, verification status, and freshness.
5. **Explain, don't mystify** — every recommendation ships with a one-sentence "because".
6. **Human control** — Mandhira recommends; the user confirms. No meaningful change is applied without an explicit tap.

### The decision test
> Does this make the journey easier to understand, easier to manage, more trustworthy, more adaptable, and more meaningful — while keeping the traveler in control?

If a proposed feature fails this test, it is not built.

---

## 👤 3. TARGET USER

### 3.1 Primary persona — The Pilgrimage Journey Planner
The adult who carries responsibility for making the journey work, for themselves and usually for others (parents, spouse, children, a small family group).

**Defining trait:** responsibility, not age.

**Situation:** limited days, fixed travel dates, a return journey that cannot slip, one or more experiences that are deeply important, unfamiliarity with the destination (or visiting after many years), possibly travelers in the group with different physical needs, and uncertainty about which online information is current.

**Questions they are asking:**
Where should we go? What actually matters? What do we do first? How much time do we need? Can we fit everything? What should we skip? What if we're delayed? Will we miss something important? Can everyone in my group manage this?

**What they need from Mandhira:** a way to say what matters, confidence that the plan is realistic, a calm answer to "what now?" during the trip, and a way through when things change.

### 3.2 Generalized traveler model (the app must support all of these from day one)
The journey holds a **Traveler Group** with 1–12 travelers. Each traveler has a profile the planner can fill in progressively (nothing is mandatory except a label):

| Attribute | Values | Effect on engine |
|---|---|---|
| Label | free text ("Amma", "Me") | display |
| Mobility | `full` / `limited_walking` / `wheelchair` / `needs_rest_frequently` | walking-distance limits, step/queue warnings, buffer multipliers |
| Age band | `child` / `adult` / `senior` | experience eligibility notes, pace multiplier |
| Dietary | free text tags | facility filtering |
| Language | locale | phrase assistance language |

Journey-level preferences: **Pace** (`relaxed` / `balanced` / `full`), **Structure** (`structured` / `flexible`), **Walking tolerance** (`low` / `medium` / `high`), **Transport preference** (`own_vehicle` / `public` / `hired` / `walk_where_possible`), **Start-of-day** earliest time, **End-of-day** latest time.

Covered traveler types: solo, couple, family, group, elderly, accessibility needs, first-time, experienced. The engine does not branch on type; it branches on the attributes above.

### 3.3 Secondary user — Mandhira Ops team
Researchers, editors, verifiers, translators, media managers, support agents, and administrators who keep the Knowledge Layer accurate. Their success is measured in Section 8 (Knowledge & Operational Quality).

---

## ✨ 4. CORE FEATURES

Features are numbered F1–F20. Each has: **Purpose · Spec · Rules · Acceptance criteria.** Features F1–F16 belong to the Mandhira App; F17–F20 belong to Mandhira Ops.

### F1. Knowledge Model (shared foundation)

**Purpose.** One structured model that every app screen and every ops workflow reads and writes. No free-floating text blobs for important facts.

**Entities and required fields.**

| Entity | Required fields | Optional structured fields |
|---|---|---|
| Destination | id, name (per locale), region, geo centre, overview, status (`draft`/`published`/`archived`) | best seasons, seasonal notes, advisories, hero media, nearby destinations, circuits it belongs to |
| Place | id, destination id, name, type (`temple`/`shrine`/`sacred_site`/`ghat`/`viewpoint`/`facility`/`transport_point`/`accommodation`/`food`), geo point, address | opening schedule, closure rules, accessibility record, dress/entry requirements, typical visit duration (min/likely/max in minutes), crowd pattern by day-part, media, practical guidance blocks |
| Experience | id, place id (or route id), name, type (`darshan`/`ritual`/`aarti`/`seva`/`festival`/`event`/`walk`/`cultural`/`other`), availability model, duration (min/likely/max) | preparation requirements, advance-booking requirement (yes/no + how), eligibility notes, significance summary (neutral tone), cost note (informational only), queue expectation |
| Availability model | one of: `always_during_opening` / `daily_fixed_times[]` / `weekly_pattern` / `date_range` / `calendar_dates[]` / `on_request` | capacity note, seasonal overrides |
| Route | id, ordered place ids, mode, distance, duration (min/likely/max), difficulty (`easy`/`moderate`/`hard`) | elevation note, rest points, accessibility record |
| Transport connection | id, from place/destination, to place/destination, mode, typical duration, frequency note | operator, booking note, seasonal variation |
| Facility | Place of type facility with subtype: `restroom`/`drinking_water`/`cloakroom`/`medical`/`parking`/`atm`/`rest_area`/`help_desk` | hours |
| Accessibility record | step_free (yes/no/partial), wheelchair access (yes/no/partial), queue assistance available, rest seating, distance from nearest drop-off (metres) | notes |
| Practical guidance block | type (`before_you_go`/`what_to_carry`/`etiquette`/`timing_tip`/`safety`/`family`/`accessibility`), body (per locale) | applies-to (place/experience/destination) |
| Media | id, type, url, caption (per locale), credit, licence | |
| Phrase | id, context tag, source text, per-locale translations, transliteration | audio |

**Trust record (attached to every entity and to every individually verifiable field such as a timing):**

| Field | Values |
|---|---|
| source_id | link to a Source (see F17) |
| source_tier | `T1 official authority` / `T2 official destination org or licensed provider` / `T3 approved partner or structured service` / `T4 curated research` / `T5 user report` |
| verification_status | `unverified` / `ai_extracted` / `human_reviewed` / `verified` / `disputed` |
| verified_at | timestamp |
| verified_by | ops user id |
| valid_until | date or null |
| freshness | computed: `fresh` (verified ≤ 90 days and not past valid_until) / `aging` (91–180 days) / `stale` (>180 days or past valid_until) |
| confidence | `high` / `medium` / `low` — computed: T1–T2 + verified + fresh → high; verified + aging, or T3 verified fresh → medium; everything else → low |
| conflict_flag | true when ≥2 sources of tier ≤ T3 disagree and the conflict is unresolved |

**Rules.**
- A fact with `verification_status = unverified` or `ai_extracted` is **never shown** to app users. Minimum to publish is `human_reviewed`.
- Timings, availability, closures, and requirements are *critical fields*: they carry their own trust record independent of the parent entity.
- Every published entity has ≥1 locale with full content; missing locales fall back to English with a visible "Not yet available in [language]" label.

**Acceptance.** A destination can be created with 50 places, 120 experiences, 30 routes, and 200 facilities without schema change. Every critical field renders a trust badge (F9) in the app.

---

### F2. Discovery

**Purpose.** Help the traveler find *meaningful possibilities for their journey*, not browse a directory.

**Spec.**
- Home (pre-journey) shows: search bar, "Plan a journey" primary CTA, "Continue your journey" card if one exists, and up to 3 destination cards relevant to the user's stated interests/region (or top destinations by published depth if no signal).
- Destination page sections, in order: Overview · "What people come here for" (top experiences, ranked by editorial weight set in Ops, never by popularity alone) · Important places · Rituals & events (with next occurrence) · Seasonal guidance · Practical essentials · Accessibility summary · Getting there & around · Nearby meaningful places · Sources & freshness footer.
- Every Experience card shows: name, 1-line significance summary, availability in plain language ("Daily 6:00–7:30 AM", "Next: Sat 12 Oct"), likely duration, advance-booking flag, accessibility icon set, trust badge.
- Every card has a single action: **"Add to journey"** (adds as IMPORTANT by default, user can change the tier in the same bottom sheet).
- Search (F3) is context-aware: if a journey is active, results are ranked with "fits your journey" first.
- Filters (max 6 visible): Type, Availability on my dates, Accessibility, Duration, Advance booking required, Near a place I've added.

**Rules.** No infinite feeds. Maximum 20 cards per section, then "See all". No reviews, no star ratings, no "trending".

**Acceptance.** A user who knows nothing about a destination can identify its 3 most significant experiences, whether they are available on their dates, and whether any need advance booking, within 60 seconds and without scrolling past 3 screens.

---

### F3. Intent Capture (natural language + structured)

**Purpose.** Let the user say what they want the way they would say it to a knowledgeable friend; convert it into structured journey inputs.

**Spec.**
- Entry: "Plan a journey" → a single text box with placeholder *"Tell me about the journey you want to make…"* plus a "Or answer a few questions" link to the structured form.
- Example accepted input: *"3 days in Tirumala with my parents. Amma can't walk much. Suprabhatam darshan is the one thing we must do. Return train on Sunday 6 PM from Tirupati."*
- The AI extracts into a **Journey Brief** the user reviews and edits before anything is built:

| Brief field | Example |
|---|---|
| Destination(s) | Tirumala |
| Dates / duration | 3 days (dates picker pre-filled if stated) |
| Travelers | Me (adult), Amma (senior, limited_walking), Nanna (senior) |
| Must-do (→ PROTECTED) | Suprabhatam darshan |
| Fixed commitments (→ FIXED) | Return: Tirupati station, Sun 18:00 |
| Would like (→ IMPORTANT) | — |
| Preferences | pace: relaxed (inferred from "can't walk much" — shown as *suggested*, user confirms) |
| Unclear / needs confirmation | "Do you mean Suprabhatam seva (ticketed, early morning) or general early darshan?" |

- The structured form asks the same fields in 5 screens max, with skip allowed on everything except destination and dates.
- The AI **never** adds an experience the user did not mention to "Must-do". It may list suggestions under "You might also consider" after the brief is confirmed.
- Every inferred value is labelled *Suggested* and requires a tap to confirm.

**Rules.** AI output is constrained to Knowledge Model IDs; if the user names an experience that does not exist in the published knowledge, the brief shows "We don't have verified information about '[X]' yet" and offers the closest matches — it never invents an entry.

**Acceptance.** ≥85% of brief fields extracted correctly on a 100-sentence test set in each launch language; 100% of hallucinated experiences blocked by the ID constraint.

---

### F4. Journey Builder with Priority Tiers

**Purpose.** Turn the confirmed brief into a realistic day-by-day journey the user owns.

**Spec.**
- Mandhira proposes an initial journey from the brief. The user sees it as a **Day view**: a vertical timeline per day with items; each item shows tier chip, time window, duration, and travel leg to the next item.
- Items types: `experience`, `travel_leg`, `rest`, `meal`, `fixed_commitment`, `free_time`.
- **Tiers** (chip colors defined in Section 13):
  - **FIXED** — cannot move; has an exact time (trains, flights, booked seva slots, return journey). Engine never moves or removes.
  - **PROTECTED** — highest user priority; engine never removes; may propose moving only within availability, and only with user confirmation.
  - **IMPORTANT** — engine may propose moving or swapping with an alternative; never removes without confirmation.
  - **OPTIONAL** — engine may propose removing first when time is short; always asks.
- Actions on an item: change tier, move (drag or "Move to…"), set preferred time window, add a dependency ("after X"), add a note, remove.
- Each experience item carries **preparation requirements** pulled from knowledge (e.g., "Advance booking required — opens 60 days before", "Dress code", "Carry ID"). These automatically generate Prepare checklist items (F7).
- **Buffers:** engine inserts travel legs (from Transport/Route knowledge, likely duration) and a default buffer of 15 min per transition; ×1.5 if any traveler is `senior` or `limited_walking`, ×2 if `wheelchair` or `needs_rest_frequently`. Buffers are visible and editable.
- **Return guard:** the last FIXED item of the journey (return) is always anchored; the engine computes required departure from the last place and blocks any plan that breaches it (shows Broken health, F5).
- "Simplify this day" action: engine proposes removing OPTIONAL items first, then proposes moving IMPORTANT items to another day, presented as a change card (F6) — never auto-applied.

**Rules.** The builder never displays an empty "pick anything" canvas; it always starts from the brief. There is no "auto-fill my day with top places" button.

**Acceptance.** A 3-day journey with 12 items, 2 FIXED, 2 PROTECTED, can be built, reordered, and retiered in under 5 minutes on a mobile device, with Journey Health visibly updating on each change within 500 ms.

---

### F5. Feasibility & Journey Health Engine

**Purpose.** Continuously answer "can this still realistically happen?" and say so plainly.

**Spec.** For each day and for the whole journey, the engine computes:

1. **Time load** = Σ(item likely duration) + Σ(travel leg likely duration) + Σ(buffers), compared with the available window (day start → day end, or → next FIXED item).
2. **Availability fit** = each experience's scheduled slot falls inside its published availability on that date (else: flagged).
3. **Dependency fit** = all "after X" relations satisfied.
4. **Physical load** = total walking metres and standing/queue minutes vs. the most constrained traveler's limits (defaults: limited_walking 2,000 m/day, wheelchair step-free only, needs_rest_frequently: rest ≥10 min every 90 min).
5. **Trust exposure** = count of critical fields in the day with confidence `low` or `conflict_flag`.

**Journey Health states (per day, and journey = worst day):**

| State | Condition | Displayed as |
|---|---|---|
| Comfortable | time load ≤ 80% of window, all fits pass | "Comfortable — there's room to breathe." |
| Tight | 80% < load ≤ 100%, or any physical-load warning | "Tight — workable, but delays will have an effect." |
| At Risk | load > 100% by ≤ 60 min, or availability/dependency flag on IMPORTANT/OPTIONAL | "At risk — something may not fit. Let's look at options." |
| Broken | load > 100% by > 60 min, or a PROTECTED/FIXED item is infeasible, or return guard breached | "This day can't work as planned. Here's what would need to change." |

- Each state opens a detail sheet listing the specific causes in plain language, e.g., "Walking to [place] and back is about 3.1 km — above Amma's comfortable limit."
- Trust exposure shows as a separate line: "2 timings here haven't been verified recently."

**Rules.** The engine uses *likely* durations for health and *max* durations for "worst case" preview. It never shows a numeric score; it shows the state and causes.

**Acceptance.** Health recomputes on every edit in ≤500 ms for a 7-day, 60-item journey. Every non-Comfortable state lists ≥1 concrete cause.

---

### F6. Adaptive Replanning

**Purpose.** When reality changes, explain the impact and offer explicit options. Never silently rewrite.

**Triggers.**

| Trigger | How it enters |
|---|---|
| User running late | User taps "I'm running late" on NOW and picks +15 / +30 / +60 / custom |
| Activity took longer / finished early | User taps "Done" on NOW at a time different from plan (auto-detected delta) |
| User wants to stay longer | "Stay longer here" on NOW |
| Experience unavailable / closure / timing change | Knowledge update (F17) or live feed (F10) affecting an item in an active or upcoming journey |
| Transport change | Live feed (F10) or user-entered |
| Weather advisory | Live feed (F10) affecting outdoor routes |
| User adds / removes an item | Builder action |
| User changes pace or priorities | Preferences edit |

**Impact evaluation (runs on every trigger):**
1. Re-run F5 for the affected day(s).
2. Classify outcome: `no_impact` / `tight` / `item_at_risk[]` / `protected_at_risk[]` / `return_at_risk`.
3. Generate ≤3 options using the **option ladder**, in order, stopping when health returns to Tight or better:
   - (a) Absorb into buffers/free time.
   - (b) Shorten or move OPTIONAL items.
   - (c) Move IMPORTANT items to another feasible day or swap with a verified alternative.
   - (d) Move PROTECTED items within their availability window (requires confirmation, highlighted).
   - (e) Remove OPTIONAL items.
   - (f) Propose removing IMPORTANT items (last resort; never PROTECTED; never FIXED).
4. Rank options by: protects more PROTECTED → fewer items removed → fewer items moved → less added travel.

**Change Card (the only UI for replanning).** Always shows, in this order:
- **What changed** — "You're about 30 minutes behind."
- **Why it matters** — "Evening aarti at [place] starts at 6:30 PM and can't move."
- **Recommended** — one option with a one-sentence *because*: "Because it keeps both of your protected experiences."
- **Other options** — up to 2, each with what moves/what's removed.
- **Keep my plan as is** — always present; shows the resulting health state if chosen.
- Each option lists affected items with before/after times.

**Rules.**
- Nothing is applied until the user taps an option. `no_impact` outcomes show a quiet toast ("Still on track.") — no card.
- When the trigger is a knowledge or live-data change, the card shows the trust badge of the new information and, if confidence is `low`, the line "This isn't fully confirmed yet — you may want to check locally."
- Replanning works offline for user-initiated triggers (late / done / stay longer) using cached knowledge; external-data triggers queue until online.

**Acceptance.** For a test set of 50 journeys × 8 trigger types, every trigger that breaks health produces a card with ≥1 option restoring Tight-or-better where mathematically possible, and never proposes removing a PROTECTED or moving a FIXED item.

---

### F7. Prepare

**Purpose.** Make the journey ready before departure.

**Spec.**
- **Prepare tab** appears once a journey has a date ≤ 30 days away (or always on demand).
- Auto-generated checklist grouped: *Bookings & tickets* (from advance-booking requirements, with the "how" text and deadline), *Documents*, *What to carry* (deduplicated from all items), *Know before you go* (etiquette/dress per place), *For your travelers* (accessibility-specific notes), *Downloads* (see F11).
- Each item: checkbox, source/trust badge where it comes from knowledge, "Why?" expander.
- Deadlines produce notifications (F15): 7 days, 1 day before.
- **Journey Summary** (shareable read-only page + printable): day-by-day, with tiers, times, places, requirements, and emergency/facility essentials.

**Acceptance.** A journey with 3 advance-booking experiences produces 3 dated booking tasks with instructions; the printed summary fits one A4 page per day.

---

### F8. Live Journey — NOW / NEXT / LATER

**Purpose.** During the journey, reduce the product to three questions.

**Spec.**
- Live Journey mode activates automatically on the first journey day at the day-start time, or when the user taps "Start today".
- Screen layout (single scroll, no tabs inside it):
  - **NOW** card (large): current item name, place, what to do ("Join the queue at the east gate"), time guidance ("Aim to be done by 9:40 AM"), practical chips (restroom 120 m, water, cloakroom), phrase assistance shortcut, and three actions: **Done**, **Running late**, **Stay longer**.
  - **NEXT** card: next item, departure-by time, travel leg with mode and duration, "Navigate" (hands off to the device's maps app with coordinates), preparation reminder if any.
  - **LATER**: compact list of the rest of the day; each row shows tier chip and time window; tap to expand.
  - **Journey Health pill** pinned at top with the day's state; tap opens causes.
- Between items, NOW shows the travel leg as the current focus.
- Free time / rest blocks show "Nothing you need to do right now" with the next departure time.
- End of day: "Today is complete" card with tomorrow's first item and any prep needed tonight.

**Rules.** No calendar grid, no full-week view inside Live mode. Maximum 3 actions on any card. Every timing shown has a trust badge on long-press.

**Acceptance.** A user can determine what to do now, when to leave, and where to go next within 5 seconds of opening the app, verified by task-based usability test (≥90% success, n≥10).

---

### F9. Trust Layer (user-visible)

**Purpose.** Make source, verification, freshness, and confidence visible without technical noise.

**Spec.**
- **Trust badge** on every critical field: a small icon + word.
  - ✓ *Verified* — confidence high.
  - ◐ *Verified earlier* — confidence medium (aging or T3).
  - ! *Check locally* — confidence low, or conflict_flag, or stale.
- Tap/long-press a badge → **Trust sheet**: "Source: [source name, tier in words e.g. 'Official temple authority']" · "Last confirmed: [date]" · "Valid until: [date]" if any · conflict note if any ("Two sources list different evening timings. We show the official one.") · "Report a change" button (F14).
- Destination and place pages have a **Sources & freshness** footer listing all sources used and the oldest verification date on the page.
- Any stale critical field in an *active* journey triggers a one-time in-journey note on that item's card: "This timing was last confirmed [N] months ago."

**Rules.** Never display a confidence percentage. Never hide a low-confidence badge to make a page look cleaner. AI-generated explanatory text is labelled "Mandhira summary" and is never given a Verified badge.

**Acceptance.** 100% of published critical fields render a badge; trust sheet opens in ≤1 tap from any badge.

---

### F10. Live & Dynamic Information

**Purpose.** Bring current conditions into the journey without pretending estimates are facts.

**Spec.** Three visibly distinct categories:

| Category | Examples | Label shown |
|---|---|---|
| Verified knowledge | opening schedule, ritual timings | Trust badge (F9) |
| Dynamic (curated, changes on a schedule) | seasonal timings, festival calendars, advisories entered by Ops | "Updated [date]" |
| Live (external real-time) | weather, transport status, route/road conditions, closures, availability where a legitimate feed exists | "Live · [provider] · as of [time]" |

- Live feeds are integrated per destination via the Ops Source registry (F17) with provider, refresh interval, and fallback behaviour.
- If a live feed is unavailable, the UI shows "Live update unavailable — showing last known (as of [time])" and the field's badge drops to *Check locally*.
- Live changes that affect an active/upcoming journey item raise an F6 trigger.

**Rules.** Never show a live value without provider and timestamp. Never show illustrative/placeholder data in a live slot.

**Acceptance.** Weather and at least one transport feed live for launch destinations; feed outage produces the fallback label within 60 seconds.

---

### F11. Offline Continuity

**Purpose.** The journey survives poor connectivity.

**Spec.**
- When a journey is created or edited, Mandhira automatically stores offline: the journey, every place/experience/route/facility it references, their practical guidance, phrase packs for the destination in the user's language, essential facility locations, and map tiles for a 5 km radius around each destination centre (user can expand to 15 km).
- **Downloads** section in Prepare shows size, last updated, and "Update now".
- Offline indicator (small, top of screen): "Offline — using saved information (as of [time])".
- Offline-capable: Live Journey (F8) fully, user-initiated replanning (F6), Prepare checklist, phrase assistance, saved pages, reading trust sheets.
- Online-only: search across unsaved destinations, live feeds, account sync, reporting (queued and sent when online).
- On reconnect: sync silently; if a knowledge update affects the active journey, show a single card "Some information updated while you were offline" listing the items.

**Rules.** The user never sees a sync error dialog; conflicts resolve last-write-wins on the user's own edits and server-wins on knowledge, with the reconciliation card above.

**Acceptance.** Airplane-mode test: a full 3-day journey is readable and replannable; reconnect reconciles within 30 seconds with no data loss.

---

### F12. Multilingual & Phrase Assistance

**Purpose.** Language is never a barrier to understanding or navigating.

**Spec.**
- Locale selection at first launch and in settings; applies to interface, knowledge content, guidance, notifications, and AI responses.
- Fallback rule per field to English with visible label (F1).
- **Phrase assistance**: from NOW card or any place page — context-tagged phrases (asking directions, queue help, facilities, medical, dietary), shown as: local-language text, transliteration, and the user's language; tap-to-play audio where available; "Show to someone" full-screen large-text mode.
- Locale packs are data, not code: adding a language = adding a locale row in Ops (F19) and translating strings/content; no UI redesign.

**Acceptance.** en/te/hi complete for launch destinations; adding a 4th language requires zero front-end code changes.

---

### F13. Accounts, Preferences & Continuity

**Spec.**
- Sign-in: phone OTP (primary), email, Google. Guest mode allowed; guest draft migrates on sign-in.
- Profile holds: name, locale, notification preferences, default traveler group, saved places, journeys (draft / upcoming / active / completed), personalization signals.
- **Progressive personalization**: Mandhira stores explicit signals only (tiers set, preferences chosen, experiences kept/removed, pace changes). Recommendations use these to rank; the app shows "Because you protected [X] last time" explanations. No dark inference from dwell time.
- Multi-device: journeys sync; active journey device is the one with the latest edit.

**Acceptance.** Sign-in on a second device shows the same journey state within 10 seconds.

---

### F14. User Reports

**Spec.**
- From any trust sheet, place, or NOW card: **Report a change** → type (`timing_changed` / `closed` / `accessibility_issue` / `wrong_information` / `outdated_guidance` / `other`), optional description (≤500 chars), optional photo, auto-attached: entity id, field, user locale, timestamp, journey context (with consent).
- Reports are signals (T5), never auto-published. They enter the Ops Reports queue (F18).
- User sees: "Thanks — our team will verify this." Later: notification when resolved ("Updated" / "Confirmed as correct" / "Couldn't verify").
- Three independent reports on the same field within 14 days automatically set the field's badge to *Check locally* until Ops resolves.

**Acceptance.** Report submitted offline is delivered on reconnect; status notification arrives on resolution.

---

### F15. Notifications

**Spec.** Types and defaults (all user-switchable):

| Type | Timing | Default |
|---|---|---|
| Prepare deadline | 7 d and 1 d before booking deadline | on |
| Journey starts tomorrow | 6 PM day before | on |
| Leave-by reminder | 15 min before each travel leg during Live mode (local, works offline) | on |
| Change affecting your journey | immediately, opens Change Card | on |
| Report resolved | on resolution | on |
| Destination advisory | when Ops publishes one for an upcoming journey | on |
| Suggestions / new content | weekly max | off |

**Rules.** Tone per Section 13. Never more than 1 non-journey notification per week. No marketing.

---

### F16. Complete & Reflect

**Spec.**
- When the last journey day ends: "Your journey is complete" card.
- **Journey Record**: timeline of what was done (from Done taps), with times; experiences completed vs planned; the user's own notes/photos added to items; protected experiences completed (plain statement, no "score").
- Reflection prompt (optional, skippable): 3 open questions ("What was most meaningful?", "What would you do differently?", "Anything we got wrong?"). Answers are private; the last one offers to create Reports (F14).
- Journey history list; "Plan a similar journey" copies travelers, preferences, and tiers into a new brief.

**Rules.** No social sharing by default; the shareable summary (F7) is the only share surface and is opt-in.

---

### F17. Ops — Source Registry & Ingestion

**Purpose.** Every fact has a source; sources have trust levels; collection is systematic.

**Spec.**
- **Source** record: id, name, type (`official_authority` / `official_destination_org` / `government` / `licensed_provider` / `partner` / `structured_service` / `curated_research` / `user_report`), tier (T1–T5), URL/contact, coverage (destinations/entities), refresh cadence (days), ingestion method (`manual` / `url_monitor` / `api` / `file_upload`), owner, status.
- **Ingestion jobs**: scheduled or manual; each run stores raw capture (page snapshot / file / API payload), timestamp, and diff vs previous capture.
- **AI-assisted extraction** (ops only): from a capture, AI proposes structured entities/fields mapped to the Knowledge Model with per-field confidence and the exact source excerpt. Output status is always `ai_extracted` and lands in the Review queue (F18). AI cannot publish.
- **Change detection**: when a monitored source's capture diff touches an existing published field, a *Change candidate* is created with old/new value and excerpt.
- **Conflict detection**: when two sources of tier ≤T3 yield different values for the same field, a *Conflict* is opened automatically.

**Acceptance.** A URL-monitored source whose timing text changes produces a Change candidate in the Review queue within one refresh cycle, with the excerpt highlighted.

---

### F18. Ops — Review, Verify, Approve, Publish

**Purpose.** The lifecycle SOURCE → COLLECT → EXTRACT → NORMALIZE → VALIDATE → VERIFY → REVIEW → APPROVE → PUBLISH → MONITOR → RE-VERIFY, enforced by the tool.

**Queues (each a filterable, assignable work list):**
1. **Review** — `ai_extracted` and new human drafts. Reviewer sees proposed value, source excerpt, side-by-side with current published value. Actions: accept (→ `human_reviewed`), edit & accept, reject with reason, request verification.
2. **Verify** — items needing confirmation against a T1/T2 source. Verifier attaches source/evidence, sets `verified_at`, `valid_until`. → `verified`.
3. **Conflicts** — shows all competing values with tiers and dates. Actions: choose winner (with reason), mark both valid with context (e.g., seasonal), escalate. Resolution clears `conflict_flag`.
4. **Approve** — editors/approvers see the full entity diff, validation results (required fields, locale completeness, media licence present), and the list of affected upcoming journeys (count). Approve → scheduled or immediate publish.
5. **Reports** — user reports (F14) grouped by entity/field, with count and recency; triage to Verify or close with user-facing outcome.
6. **Freshness monitor** — all published critical fields by freshness; filters: stale, aging, expiring within 30 days, low confidence, conflict. Bulk "assign re-verification".
7. **Impact** — when a change is approved that affects active/upcoming journeys, Ops sees the count and the notification preview before publish; publish raises F6 triggers for those journeys.

**Validation rules enforced before publish:** all required fields present; critical fields have a trust record with `verification_status ≥ human_reviewed`; at least one locale complete; media has licence; no open conflict on the entity; geo point inside destination bounds.

**Audit & history:** every field change stores who/when/what/why, previous value, and source; any version is viewable and restorable by Admin role.

**Roles (RBAC):** `Researcher` (create drafts, run ingestion) · `Reviewer` (Review queue) · `Verifier` (Verify/Conflicts) · `Editor` (edit any draft, Approve for non-critical fields) · `Approver` (Approve incl. critical fields, publish) · `Translator` (locale content only) · `Media` (media only) · `Support` (Reports queue, read-only elsewhere) · `Admin` (everything + users + sources). One user may hold multiple roles; a change cannot be reviewed and approved by the same user.

**Acceptance.** Attempting to publish an entity with an unverified critical field is blocked with the specific field named. A full new destination with 40 places can go from draft to published through the queues by a 3-person team in ≤5 working days (measured in pilot).

---

### F19. Ops — Content, Media, Translation, Locale Management

**Spec.**
- Entity editors for all F1 entities with structured forms (no free-form HTML for critical fields), inline trust record panel, preview-as-app.
- Relationship tools: link places ↔ experiences ↔ routes ↔ facilities; "nearby meaningful" curation; circuit builder (ordered destinations).
- Editorial weight (1–5) per experience for Discovery ranking.
- Media library: upload, crop presets, caption per locale, credit, licence, usage list.
- Translation workspace: per-entity, per-locale, side-by-side source/target, AI draft suggestion (flagged `ai_draft`), translator confirms; completeness dashboard per locale.
- Locale management: add a locale (code, name, script, transliteration rules) → becomes available across app and Ops.
- Phrase pack editor with audio upload.

---

### F20. Ops — Monitoring, Analytics & Admin

**Spec.**
- **Knowledge health dashboard:** % critical fields fresh/aging/stale, open conflicts, queue ages (oldest item), reports open/resolved, locale completeness, destinations by depth (places, experiences, verified %).
- **Product signals** (aggregated, privacy-safe, Section 11): journeys created, % with ≥1 PROTECTED, health distribution at departure, replanning cards shown/accepted, Live-mode daily active during journeys, offline usage, report rate per 1,000 journey-days.
- **User & role admin**, source admin, feature flags per destination (e.g., enable a live feed), advisory publisher (destination-level notices with start/end dates).

---

## 📱 5. SCREEN INVENTORY

### 5.1 Mandhira App (mobile-first)

| # | Screen | Purpose | Primary elements | Primary action |
|---|---|---|---|---|
| A01 | Welcome & Language | first-run locale | 3 language tiles (+ more), 1 sentence of promise | Continue |
| A02 | Home | entry point | Search, "Plan a journey", Continue-journey card, ≤3 destination cards | Plan a journey |
| A03 | Search results | find experiences/places | Grouped results, 6 filters, "fits your journey" ranking | Open / Add |
| A04 | Destination | understand a destination | Sections per F2, Sources & freshness footer | Add experience |
| A05 | Place | understand a place | Hero, essentials (hours, duration, access), experiences here, guidance blocks, facilities nearby, trust footer | Add to journey |
| A06 | Experience | understand an experience | Significance, availability calendar, duration, requirements, preparation, accessibility, trust | Add (tier picker sheet) |
| A07 | Plan — Intent | natural-language input | Text box, mic, "answer questions" link | Continue |
| A08 | Plan — Brief review | confirm extraction | Editable brief table, "Suggested" labels, unclear questions | Build my journey |
| A09 | Plan — Structured form (×5) | alternative to A07 | Destination/dates · Travelers · Must-do · Would-like · Preferences | Next / Skip |
| A10 | Journey — Days | the plan | Day tabs, timeline items, tier chips, travel legs, Health pill | Edit item |
| A11 | Item editor (sheet) | edit one item | Tier, time window, dependency, note, remove | Save |
| A12 | Health detail (sheet) | why this state | Causes list, trust exposure | Fix with options |
| A13 | Change Card (sheet/full) | replanning | What changed / Why / Recommended / Options / Keep as is | Choose option |
| A14 | Prepare | readiness | Grouped checklist, deadlines, Downloads, Summary | Tick items |
| A15 | Journey Summary | shareable/print | Day-by-day read-only | Share / Print |
| A16 | Live Journey | NOW/NEXT/LATER | As F8 | Done / Late / Stay |
| A17 | Phrase assistance | language help | Context tabs, phrases, audio, "Show to someone" | Play / Show |
| A18 | Trust sheet | provenance | Source, confirmed date, validity, conflict note | Report a change |
| A19 | Report a change | user report | Type, text, photo | Submit |
| A20 | Journey complete & Record | reflection | Timeline, notes, 3 prompts | Save |
| A21 | My journeys | history | Draft/Upcoming/Active/Completed | Open / Plan similar |
| A22 | Saved places | bookmarks | List | Open |
| A23 | Profile & Travelers | account | Sign-in, travelers, preferences, language, notifications | Save |
| A24 | Offline banner & Downloads | connectivity | Status, sizes, update | Update now |
| A25 | Advisory notice | destination notices | Title, body, dates, source | Dismiss |

### 5.2 Mandhira Ops (desktop web)

| # | Screen | Purpose |
|---|---|---|
| O01 | Ops Home / Knowledge health | dashboard per F20 |
| O02 | Destinations list & editor | F19 |
| O03 | Places list & editor | F19 |
| O04 | Experiences list & editor (incl. availability model builder) | F19 |
| O05 | Routes & transport editor | F19 |
| O06 | Facilities & accessibility editor | F19 |
| O07 | Guidance blocks editor | F19 |
| O08 | Sources registry & source detail (captures, diffs) | F17 |
| O09 | Ingestion jobs & AI extraction results | F17 |
| O10 | Review queue & item review (side-by-side) | F18 |
| O11 | Verify queue | F18 |
| O12 | Conflicts | F18 |
| O13 | Approve & publish (diff, validation, impact count) | F18 |
| O14 | Reports queue | F18 |
| O15 | Freshness monitor | F18 |
| O16 | Media library | F19 |
| O17 | Translation workspace & locale completeness | F19 |
| O18 | Locales & phrase packs | F19 |
| O19 | Advisories publisher | F20 |
| O20 | Audit log & version history | F18 |
| O21 | Users, roles, feature flags | F20 |
| O22 | Product signals | F20 |

---

## 🔄 6. KEY USER FLOWS

### Flow 1 — From intention to a realistic journey
1. A02 Home → tap "Plan a journey".
2. A07: type "3 days in [destination] with my parents, Amma can't walk much, [experience] is a must, return train Sunday 6 PM."
3. A08: Brief shows destination, 3 days, 3 travelers (Amma: senior, limited_walking — *Suggested*), PROTECTED: [experience], FIXED: return Sun 18:00, pace: relaxed (*Suggested*). One clarification question. User confirms tier and pace with one tap each; answers clarification.
4. Tap "Build my journey" → A10 shows 3 days; Health pill reads Comfortable/Tight per day; return guard visible on Day 3.
5. User opens Day 2, drags an IMPORTANT item to Day 1; Health updates; a Tight cause appears: walking 2.6 km > Amma's limit. User taps cause → option "Add a rest block" → accepts.
6. User changes one item to OPTIONAL; a dependency "after morning darshan" on another.
7. Tap Save → prompt to sign in (phone OTP) → journey saved; Prepare tab appears with 2 booking deadlines.

### Flow 2 — Preparing before departure
1. A14 Prepare: Bookings (2 items with deadlines and instructions), Documents, What to carry (deduplicated), Know before you go, For Amma (accessibility notes), Downloads (size 38 MB).
2. User taps "Why?" on a dress-code item → trust sheet shows Official temple authority, confirmed 21 days ago.
3. Notification 7 days before booking deadline; user books externally and ticks the item; user enters booked slot time → item becomes FIXED automatically (confirmation asked).
4. User taps Downloads → Update now → offline ready.
5. User shares Journey Summary to family group.

### Flow 3 — Living the day (NOW / NEXT / LATER)
1. Day 1, 05:30: Live Journey opens on NOW: the protected morning experience, "Be at the east gate by 5:45", chips: restroom 120 m, cloakroom.
2. 07:40 user taps Done. NEXT becomes NOW: travel leg (walk 600 m, 12 min with buffer) to breakfast/rest block.
3. LATER shows the rest of the day with tier chips.
4. 11:10 user taps "Stay longer" at a meaningful place → Change Card: "Staying 30 more minutes here makes the afternoon tight." Recommended: move the OPTIONAL item to Day 2 *because it keeps your protected evening aarti comfortably on time*. User accepts.
5. 16:45 leave-by notification for the evening aarti travel leg.
6. End of day card: "Day 1 complete. Tomorrow starts at 6:30 AM — carry your ID for [experience]."

### Flow 4 — Adapting to a delay that threatens a PROTECTED item
1. Day 2, 15:20: user taps "Running late" → +60 min.
2. Engine: evening aarti (PROTECTED, fixed availability 18:30) now infeasible with current route; Health: Broken.
3. Change Card: *What changed*: "You're about an hour behind." *Why it matters*: "Evening aarti at [place] starts at 6:30 PM and can't move." *Recommended*: "Go directly to [place] now and move [IMPORTANT item] to tomorrow morning — because it protects the aarti and keeps everything else." *Other option*: "Keep [IMPORTANT item] and skip the aarti tonight; attend tomorrow's instead (available daily)." *Keep my plan as is* → "You'll likely miss the aarti."
4. User picks Recommended → LATER updates; tomorrow's Day 3 shows the moved item with Health recomputed (still Comfortable; return guard intact).

### Flow 5 — A knowledge change reaches an active journey
1. Ops O08: monitored official source changes an evening timing from 18:30 to 18:00. Change candidate created.
2. O10 Reviewer accepts with excerpt; O11 Verifier confirms via T1 source, sets verified_at.
3. O13 Approver sees 14 upcoming journeys affected, previews notification, publishes.
4. User (upcoming journey, Day 2 tomorrow) receives "A timing in your journey changed" → Change Card with the ✓ Verified badge on the new value and an option that shifts the preceding travel leg 30 min earlier. User accepts.

### Flow 6 — User reports a closure; Ops resolves it
1. At a place, user finds a gate closed → NOW card → Report a change → `closed` + photo → submitted (queued offline, sent on reconnect).
2. Two more users report the same within 3 days → field badge drops to *Check locally* automatically.
3. O14 Support triages to Verify; Verifier confirms with authority; Editor updates closure rule; Approver publishes; all three users get "Updated — thank you".

### Flow 7 — Ops adds a new destination
1. O02 Researcher creates destination draft; registers 4 sources (T1 authority site, T2 tourism org, T3 transport API, T4 curated notes).
2. O09 runs ingestion; AI extraction proposes 38 places and 90 experiences with excerpts → Review queue.
3. O10 Reviewers accept/edit; O11 Verifiers verify critical fields against T1/T2; O12 resolves 3 conflicts (seasonal timings: both valid with context).
4. O17 Translators complete te/hi; O16 media licensed; O13 Approver publishes; destination appears in app with full badges.

### Flow 8 — Completing and returning
1. Day 3: return guard ensures last item ends by 15:30 for the 18:00 train; LATER shows "Leave for station by 16:15".
2. Journey complete card → Record shows completed experiences; reflection prompts; "Anything we got wrong?" creates 1 report.
3. A21 shows journey under Completed; "Plan a similar journey" pre-fills travelers and preferences.

---

## 📊 7. SUCCESS METRICS

Primary question: **Did Mandhira make the journey easier to understand and manage?**

| Area | Metric | Target (12 months post-launch) |
|---|---|---|
| Planning success | % of saved journeys with ≥1 PROTECTED and ≥1 FIXED item | ≥ 80% |
| Planning success | Median time from intent input to saved journey | ≤ 8 min |
| Confidence | Pre-departure survey: "I feel confident about this journey" (5-pt) | ≥ 4.2 mean |
| Reduced cognitive load | Survey: "I spent less time researching elsewhere" | ≥ 70% agree |
| Trust | % users who open ≥1 trust sheet per journey | ≥ 40% |
| Trust | Survey: "I understand where important information comes from" | ≥ 4.0 mean |
| Adaptability | Change Cards shown per journey-day (health-breaking) | tracked; ≥ 60% resolved by choosing an option within 2 min |
| Adaptability | % PROTECTED items completed when a replanning card was accepted | ≥ 85% |
| In-journey value | % journeys with Live-mode use on ≥ 80% of journey days | ≥ 60% |
| In-journey value | Leave-by reminders acted on (Done within 20 min of plan) | ≥ 70% |
| Completion | % PROTECTED items marked Done | ≥ 90% |
| Retention | % users with a second journey within 12 months | ≥ 35% |
| Knowledge quality | % published critical fields `fresh` | ≥ 90% |
| Knowledge quality | Open conflicts older than 7 days | 0 |
| Knowledge quality | Valid user reports per 1,000 journey-days | ≤ 5, trending down |
| Operational quality | Median time: change candidate → published | ≤ 3 working days |
| Operational quality | New destination (≥30 places) draft → published | ≤ 10 working days |
| Reliability | Offline Live-mode crash-free sessions | ≥ 99.5% |
| Performance | Health recompute p95 | ≤ 500 ms |

Vanity metrics explicitly not used as goals: downloads, page views, number of screens, destination count.

---

## 🚫 8. OUT OF SCOPE

These are **not part of Mandhira at all** (permanent boundaries):
- Payment processing, ticket sales, or hotel booking inside Mandhira. (External partner hand-offs are allowed via links/deep links with a clear "You're leaving Mandhira" note.)
- Star ratings, reviews, likes, follower graphs, public feeds, or any social media mechanics.
- Advertising or sponsored placement in Discovery, Journey, or Live mode.
- Ranking experiences by popularity alone.
- AI-generated "facts" published without human review.
- Prescriptive religious guidance or telling users what their journey should mean.
- Auto-applying any change to a journey without user confirmation.
- Turn-by-turn navigation (handed off to the device maps app).

These are **in the vision but not in the first public release** (see phases — deferred, not excluded):
- Collaborative multi-editor journeys (Phase 5).
- Conversational in-journey assistant (Phase 5).
- Real-time availability feeds beyond launch destinations (per-destination rollout).
- Languages beyond en/te/hi (locale packs added continuously).

---

## 🎯 9. DEVELOPMENT PHASES

Sequenced by dependency. Each phase ends with its Definition of Done (Section 12) met for everything inside it.

| Phase | Scope | Exit criterion |
|---|---|---|
| **0 — Foundations** | F1 Knowledge Model; accounts (F13 basic); locale framework (F12 plumbing, en only); design system (Section 13); Ops shell with RBAC, audit log, entity editors for Destination/Place/Experience/Route/Facility (F19 core), Source registry (F17 manual) | One destination fully entered and published through the Ops editors with trust records on all critical fields |
| **1 — Understand & Plan** | F2 Discovery; F3 Intent capture; F4 Journey Builder with tiers, buffers, return guard; F5 Health; F9 Trust layer; F7 Prepare (checklist + summary) | Flow 1 and Flow 2 pass usability test (≥90% task success, n≥10) on the Phase 0 destination |
| **2 — Live & Adapt** | F8 Live Journey; F6 Adaptive replanning (user-initiated triggers); F11 Offline; F15 notifications (journey types); F14 reports; Ops O14 Reports queue | Flow 3, 4, 6 pass in a real pilgrimage pilot with ≥10 planners; airplane-mode test passes |
| **3 — Trusted knowledge at scale** | F17 ingestion, URL monitoring, AI extraction; F18 full queues (Review/Verify/Conflicts/Approve/Freshness/Impact); F10 live feeds (weather + 1 transport) ; knowledge-change triggers into F6 | Flow 5 and Flow 7 pass; second and third destinations published by the Ops team without engineering involvement |
| **4 — Language & completion** | F12 te/hi content + phrase packs + audio; F19 translation workspace; F16 Complete & Reflect; F20 dashboards; advisories | Locale completeness ≥ 95% for launch destinations; Flow 8 passes |
| **5 — Growth of the ecosystem** | Collaborative journeys; conversational assistant (grounded on knowledge IDs only); circuits/multi-destination UX polish; additional live feeds per destination; partner hand-off integrations | Each capability passes the Section 2 decision test and its own DoD |

Rule: no phase ships a feature that breaks Principles 1–6, even temporarily (e.g., no "temporary" auto-apply of changes in Phase 2).

---

## 🔐 10. PRIVACY & SAFETY

- **Data minimisation:** collect only what a feature needs. Traveler profiles (mobility, age band) are stored on the user's account only, encrypted at rest, never used for aggregate analytics with identifiers, and deletable individually.
- **Location:** used only while Live mode is active and only on device for leave-by timing and facility proximity; never stored as a history on the server. Background location is off by default and, if enabled, limited to active journey days.
- **Health/accessibility attributes** are sensitive: never shown to Ops, never exported, never used for ad or partner targeting (there is none).
- **Reports:** photos and text are visible only to Ops roles `Support`, `Verifier`, `Editor`, `Admin`; user identity is pseudonymised in the queue.
- **Children:** no traveler profile for a child collects name beyond a label, no age beyond band; no accounts for under-18s.
- **Account controls:** export all my data (JSON) and delete my account (complete within 30 days) from A23.
- **AI safety:** user-facing AI is grounded on published Knowledge IDs; it cannot state timings, requirements, or availability that are not in verified knowledge; every AI-generated summary is labelled and never carries a Verified badge. Prompts and outputs are logged for quality review without user identifiers.
- **Physical safety:** Health engine enforces rest and walking limits; advisories (weather, closures, safety) are shown in-journey with source; emergency and medical facility locations are always in the offline pack.
- **Trust safety:** no false confidence — stale or conflicting data is always badged; Ops cannot disable badges.
- **Cultural respect:** content guidelines in Ops require neutral, respectful significance summaries; no content asserting one tradition's practice as universal.
- **Compliance:** designed to meet India's Digital Personal Data Protection Act requirements (consent notice at sign-up, purpose limitation, grievance contact in-app).

---

## ✅ 11. DEFINITION OF DONE

A feature is done only when all of the following are true:

1. **Spec fidelity:** every Rule and Acceptance line in its Section 4 entry passes, demonstrated with a recorded test.
2. **Principles check:** reviewed against Principles 1–6 with a written one-line justification each.
3. **Trust:** every critical field it displays renders a trust badge with a working trust sheet.
4. **Explanation:** every recommendation or change it produces includes a "because" sentence.
5. **Control:** no state-changing action on a journey occurs without an explicit user tap.
6. **Localisation:** all strings externalised; renders correctly in en/te/hi including script fallback; no truncation at 200% text scale.
7. **Accessibility:** WCAG 2.2 AA — contrast ≥ 4.5:1, tap targets ≥ 44×44 px, screen-reader labels on all controls, no colour-only status (every tier/health/trust state has icon + text).
8. **Offline:** if listed as offline-capable in F11, passes airplane-mode test.
9. **Performance:** app screens interactive ≤ 2 s on a mid-range Android device on 3G; Health recompute ≤ 500 ms p95.
10. **Tone:** all copy reviewed against Section 13.7 voice rules.
11. **Ops parity:** any new knowledge field has an Ops editor, validation, audit logging, and appears in the freshness monitor if critical.
12. **Telemetry:** the feature's Section 7 metrics are instrumented without personal identifiers.
13. **Documentation:** user-facing help text and Ops procedure updated.

---

## 🎨 12. DESIGN SYSTEM

Feel: calm, premium, meaningful, modern, trustworthy, warm, focused, human. Not a booking app, not a government portal, not an enterprise dashboard, not aggressively religious, not a tourism ad. Timeless over trendy.

### 12.1 Color tokens

**Brand**
| Token | Light | Dark | Use |
|---|---|---|---|
| `brand.primary` | `#FF660E` | `#FF7A30` | primary buttons, active states, key accents |
| `brand.primary.pressed` | `#D9520A` | `#E6652A` | pressed state |
| `brand.primary.soft` | `#FFEFE5` | `#3A2416` | selected backgrounds, chips |
| `brand.ink` | `#2B1A10` | `#F3E9E1` | brand headings, logotype |

**Neutrals (warm)**
| Token | Light | Dark |
|---|---|---|
| `bg.canvas` | `#FBF7F2` | `#141110` |
| `bg.surface` | `#FFFFFF` | `#1E1917` |
| `bg.surface.raised` | `#FFFFFF` (shadow) | `#272120` |
| `border.subtle` | `#EDE4DA` | `#352D2A` |
| `text.primary` | `#1F1A17` | `#F5EFE8` |
| `text.secondary` | `#6B625C` | `#B8ADA5` |
| `text.tertiary` | `#7B706A` | `#908780` |
| `text.on.primary` | `#2B1A10` | `#1A0E06` |

**Status (never colour-only; always paired with icon + word)**
| Token | Light | Dark | Use |
|---|---|---|---|
| `status.comfortable` | `#2B7449` | `#5BBF87` | Health: Comfortable; Verified |
| `status.tight` | `#856108` | `#E3B341` | Health: Tight; Verified earlier |
| `status.at_risk` | `#A0511D` | `#F09A5C` | Health: At Risk |
| `status.broken` | `#B3261E` | `#F28B82` | Health: Broken; Check locally |
| `status.info` | `#2D6AA1` | `#7FB3E3` | Live data, offline banner |

**Priority tiers**
| Tier | Chip fill (light / dark) | Text | Icon |
|---|---|---|---|
| FIXED | `#E8E2DC` / `#3A332F` | `text.primary` | lock |
| PROTECTED | `#FF660E` / `#FF7A30` | `#2B1A10` / `#1A0E06` | shield |
| IMPORTANT | `#FFEFE5` / `#3A2416` | `#B24708` / `#FFB98C` | star |
| OPTIONAL | `#F4EFEA` / `#2A2421` | `text.secondary` | circle-dashed |

`brand.primary` `#FF660E` is a **fill** colour. Brand-coloured *text* and icons on light backgrounds use `brand.primary.text` `#C14600` (light) / `#FF7A30` (dark) — #FF660E as text measures only 2.93:1 on white.

All text/background pairs above meet ≥4.5:1 contrast, verified programmatically over `bg.surface`, `bg.canvas`, raised surfaces and each status colour’s own 12% fill (see D-025). Values were revised on 2026-08-25 to close OPEN-008; the original palette had 17 sub-AA pairings. `brand.primary` itself is unchanged.

### 12.2 Typography
- **Latin UI & body:** Inter. **Display/headings:** Fraunces (soft serif, warmth without religiosity). **Telugu:** Noto Sans Telugu. **Hindi:** Noto Sans Devanagari. Fallback: system sans.
- Scale (mobile): Display 32/40 · H1 26/34 · H2 22/30 · H3 18/26 · Body 16/24 · Body-small 14/20 · Caption 12/16. Ops desktop: Body 14/20, tables 13/18.
- Weights: 400 body, 500 labels, 600 headings. No all-caps except tier chips (12 px, tracking +0.06 em).
- Minimum body size anywhere: 14 px. Supports 200% OS text scale without truncation.

### 12.3 Spacing, shape, elevation
- 4-pt grid; spacing tokens 4/8/12/16/24/32/48.
- Screen padding 16 px (mobile), 24 px (tablet), 32 px (Ops).
- Radius: cards 16 px, sheets 24 px top, chips 999 px, buttons 12 px, inputs 12 px.
- Elevation: cards use 1 px `border.subtle` + shadow `0 1px 2px rgba(31,26,23,0.06)`; raised surfaces (Change Card, NOW) `0 8px 24px rgba(31,26,23,0.10)`. Dark mode uses surface tint instead of shadow.

### 12.4 Iconography & imagery
- Line icons, 1.75 px stroke, 24 px grid (Lucide-style). Tier and status icons as above.
- Imagery: real photography of places, warm colour grade, no stock "spiritual glow" effects, no deity images as decoration, no heavy overlays. Hero ratio 3:2; card 4:3. Every image has caption, credit, licence.
- No confetti, no celebratory animations; completion states use a calm fade + single line of text.

### 12.5 Components (required library)
| Component | Spec |
|---|---|
| Primary button | 48 px height, `brand.primary`, white 16/500 text, full-width on mobile, loading spinner replaces label |
| Secondary button | 48 px, transparent, 1.5 px `brand.primary` border |
| Tertiary/text button | 44 px tap area, `brand.primary` text |
| Tier chip | 24 px, icon + label, tappable → tier picker |
| Trust badge | 20 px icon + word, long-press → Trust sheet |
| Health pill | 32 px, status colour fill 12%, icon + state word |
| Item card (timeline) | left time rail, title, place, duration, tier chip, travel leg connector below |
| NOW card | raised, 24 px padding, title 22/600, ≤3 action buttons in a row |
| Change Card | bottom sheet, sections in fixed order (What changed / Why / Recommended / Options / Keep as is); Recommended option has `brand.primary.soft` fill |
| Bottom sheet | 24 px top radius, drag handle, max 90% height |
| Checklist row | 44 px, checkbox 24 px, "Why?" expander |
| Offline banner | 36 px, `status.info` 12% fill, icon + text |
| Section footer "Sources & freshness" | `bg.surface`, caption text, sources list |
| Ops data table | sticky header, 13/18, row 40 px, inline status tags, bulk-select |
| Ops side-by-side review | two columns, diff highlight `brand.primary.soft` / `status.broken` 12% |

### 12.6 Motion
- Durations: 150 ms (state), 250 ms (sheet), 400 ms (screen). Easing `cubic-bezier(0.2, 0, 0, 1)`.
- Health pill changes colour with a 250 ms crossfade; no pulsing, no shaking.
- Respect OS reduce-motion: all transitions become instant.

### 12.7 Voice & copy rules
- Persona: a knowledgeable, calm, respectful companion. Warm, clear, culturally sensitive, non-judgmental.
- Sentence case everywhere. Second person ("your journey"). Present tense.
- Never: "URGENT", exclamation marks in system messages, "optimizing…", "error", "failed", "invalid", tourism superlatives ("must-see!", "breathtaking"), devotional imperatives ("you must offer…"), or assumptions about belief.
- Always explain with "because" for recommendations; always offer "keep as is".
- Reference strings:
  - Loading replanning: "Checking how this change affects your journey."
  - Tight: "Your schedule is becoming tight. Here are the best options to protect your priorities."
  - Doesn't fit: "This no longer fits comfortably within your available time. You can keep it, move it, or remove it."
  - Stale: "This timing was last confirmed 7 months ago. It may be worth checking locally."
  - Offline: "Offline — using saved information (as of 6:40 AM)."
  - Report received: "Thanks — our team will verify this."
  - Day complete: "Today is complete. Tomorrow starts at 6:30 AM."
- Localisation: copy written in English first with translator notes on context; Telugu and Hindi use respectful register (Telugu: మీరు; Hindi: आप).

### 12.8 Accessibility baseline
WCAG 2.2 AA; 44×44 px targets; focus rings 2 px `brand.primary`; all status via icon + text; screen-reader order = visual order; haptic on Done/option accept; high-contrast mode inherits OS setting.

---

## APPENDIX A — Journey Engine worked example (for implementers)

Day window 06:00–21:00 (900 min). Travelers include one `senior, limited_walking` → buffer ×1.5 (22.5 min per transition), walking limit 2,000 m.

| Item | Tier | Window/Time | Likely dur | Travel to next |
|---|---|---|---|---|
| Morning darshan | PROTECTED | 06:00–07:30 avail. | 90 | walk 600 m, 12 min |
| Breakfast/rest | rest | — | 45 | walk 300 m, 6 min |
| Shrine B | IMPORTANT | 09:00–12:00 avail. | 60 | vehicle 20 min |
| Viewpoint C | OPTIONAL | always | 45 | vehicle 25 min |
| Lunch/rest | rest | — | 60 | walk 200 m, 4 min |
| Museum D | OPTIONAL | 10:00–17:00 | 60 | vehicle 30 min |
| Evening aarti | PROTECTED | 18:30 fixed start | 60 | — |

Time load = 420 (items) + 97 (travel) + 6×22.5 (buffers, 135) = 652 min = 72% of 900 → **Comfortable**. Walking = 1,100 m → within limit.

Trigger: "Running late +60" at 15:20 (before Museum D). Remaining fixed point: aarti 18:30. Museum D 60 + travel 30 + buffers 45 → ends ~17:35 → arrival 18:05 → aarti feasible but ≤ 25 min slack → **Tight**. Engine option ladder stops at (a): absorb into buffers. Card shows "Still on track, but tight — aim to leave the museum by 17:00." Had the delay been +120, Museum D (OPTIONAL) would be proposed for removal first (ladder step e, since shortening fails), with "Keep as is → you'll likely miss the aarti."

---

*End of document.*
