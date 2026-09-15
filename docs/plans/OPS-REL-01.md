# Feature Implementation Plan — OPS-REL-01 (relationships and circuits)

- **Related requirements:** PRD-OPS-CNT-002 (P1: "Place↔experience↔route↔facility links; nearby curation; circuit builder; editorial weight 1–5"), PRD F19 ("Relationship tools"), PRD F1 (Destination: nearby destinations, circuits it belongs to), PRD F2 (destination page "Nearby meaningful places")
- **Backlog item:** audit remediation, Ops partials · **Pre-authorised by the founder**; decision logged as D-207
- **Objective:** Ops can curate which destinations are nearby, build circuits as ordered destinations, and see what each place is connected to.

## What already exists
- Experiences link to a place or a route in the experience editor; routes carry ordered stops (`set_route_stops`, 0042); editorial weight 1–5 on destinations, places and experiences.
- `v_published_destination_links` (0044) and the traveler destination page's "Nearby meaningful places" read `destination_links` — but nothing in Ops writes it.
- `circuits` and `circuit_destinations` exist (0003) with audit triggers (0029), and no Ops screen.

## Scope
- `set_destination_links(destination, links)` and `set_circuit_destinations(circuit, destination_ids)` (0051): replace a destination's nearby links, or a circuit's ordered destinations, in one transaction. Researchers, editors, approvers and admins — the same roles as `set_route_stops`. Needed because removing a link row is a DELETE, which RLS reserves for admins.
- `ops_place_connections(place)`: experiences at a place, routes that stop there, and facilities within 500 m, for Ops.
- Destination editor: "Nearby destinations" panel — add, note per language, remove, save.
- Circuits: list, create, edit (name, slug, description) and "Destinations in order" with move up/down, remove, add, save. A nav entry under Knowledge.
- Place editor: read-only "Connections" panel with links to each experience, route and facility.

## Out of scope
- Showing circuits to travelers (PRD phase 5, multi-destination journeys); publishing circuits. The editor says so.
- Linking a facility to a place explicitly: a facility is a place, and nearness is geographic (PRD F8 practical chips already use distance). The connections panel shows it; a manual link table is not in the TRD schema.

## Database changes
`0051_relationships_and_circuits.sql` — three functions. No new tables. Additive.

## Permission changes
Researchers, editors and approvers can remove a nearby link or circuit member through the functions (they could already add them). Every change still writes `audit_log` through the tables' triggers.

## Testing strategy
- pgTAP: links replace (add, note, remove) as a researcher; self link and unknown destination refused; traveler refused; circuit order stored and replaced; duplicates refused; connections list an experience, a route and a facility within 500 m but not one further away; audit rows written.
- E2E (Ops): link two destinations with a note and remove one; build a circuit and reorder it; the place editor shows Connections; axe on the circuit editor.

## Acceptance criteria
- [x] Ops curates nearby destinations, with a note, from the destination editor.
- [x] Ops builds a circuit of ordered destinations and changes its order.
- [x] The place editor shows experiences, routes and nearby facilities.
- [x] A traveler can do none of it; every change is audited.
