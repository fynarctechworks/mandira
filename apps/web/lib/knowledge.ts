import { Constants, type Enums } from "@mandhira/db";
import type { KnowledgeBundle } from "@mandhira/journey-engine";
import { getI18n } from "@mandhira/i18n";

import { webSupabase } from "./supabase";
import type { TrustEntry, TrustMap } from "./trust";

/*
 * Re-exported so a server component has one import for the whole read layer. The
 * definitions themselves live in `./trust` because client components need them and this
 * module reaches `next/headers` — see the note at the top of that file.
 */
export { trustStateOf, weakestTrustState } from "./trust";
export type { TrustEntry, TrustMap } from "./trust";

/**
 * The traveler's read of published knowledge (PRD F2).
 *
 * Every query here goes through a `v_published_*` view and nothing else. The base tables
 * are closed to travelers (D-029), so this module cannot accidentally show an unpublished
 * or ungated entity — that guarantee lives in the database, not in the care taken here.
 *
 * Locale resolution happens at this boundary. Everything below returns resolved strings
 * plus an `isFallback` flag, because PRD-KNOW-005 requires a traveler to be TOLD when they
 * are reading English instead of their own language, not quietly shown it.
 */

/** One `_i18n` column, resolved for the traveler's locale. */
export type Text = { text: string; isFallback: boolean };

export type Accessibility = {
  step_free: "yes" | "no" | "partial" | null;
  wheelchair_access: "yes" | "no" | "partial" | null;
  queue_assistance: boolean | null;
  rest_seating: boolean | null;
  distance_from_dropoff_m: number | null;
  notes: Text | null;
};

export type DestinationSummary = {
  id: string;
  slug: string;
  name: Text;
  region: string | null;
  overview: Text;
};

export type PlaceCard = {
  id: string;
  slug: string;
  destinationId: string;
  name: Text;
  placeType: string;
  facilitySubtype: string | null;
  summary: Text;
  visitDurationLikelyMinutes: number | null;
  /** Null means unrecorded, which is a different answer from "has none" (D-080). */
  accessibility: Accessibility | null;
  trust: TrustMap;
};

export type ExperienceCard = {
  id: string;
  slug: string;
  destinationId: string;
  name: Text;
  experienceType: string;
  significance: Text;
  durationLikelyMinutes: number | null;
  advanceBookingRequired: boolean;
  advanceBookingOpensDaysBefore: number | null;
  editorialWeight: number;
  accessibility: Accessibility | null;
  trust: TrustMap;
  /** Resolved from the experience's availability rules, for the plain-language line. */
  availability: AvailabilityWindow[];
};

export type AvailabilityWindow = { kind: string; start: string | null; end: string | null };

export type Advisory = {
  id: string;
  title: Text;
  body: Text;
  severity: "info" | "caution" | "important";
};

export type GuidanceBlock = { id: string; guidanceType: string; body: Text };

export type DestinationPage = {
  destination: DestinationSummary;
  experiences: ExperienceCard[];
  places: PlaceCard[];
  guidance: GuidanceBlock[];
  advisories: Advisory[];
  /** Every source used anywhere on the page, and the oldest verification across it. */
  sources: { name: string; tierLabel: string }[];
  oldestVerifiedAt: string | null;
};

/** The destination page (PRD F2), in one round of queries. */
export async function getDestinationPage(
  slug: string,
  locale: string,
): Promise<DestinationPage | null> {
  const supabase = await webSupabase();

  const { data: destination } = await supabase
    .from("v_published_destinations")
    .select("id, slug, name_i18n, region, overview_i18n")
    .eq("slug", slug)
    .maybeSingle();

  if (!destination?.id) return null;

  const [experiences, places, guidance, advisories, availability] = await Promise.all([
    supabase
      .from("v_published_experiences")
      // One string literal, not a concatenation: the client infers the row shape from the
      // literal type, and a joined string degrades it to an opaque error type.
      .select(
        "id, slug, name_i18n, experience_type, significance_i18n, duration_likely_minutes, advance_booking_required, advance_booking_opens_days_before, editorial_weight, trust, accessibility, destination_id",
      )
      .eq("destination_id", destination.id)
      // PRD F2: ranked by the editorial weight Ops set, never by popularity.
      .order("editorial_weight", { ascending: false })
      .limit(SECTION_LIMIT),
    supabase
      .from("v_published_places")
      .select(
        "id, slug, name_i18n, place_type, facility_subtype, summary_i18n, visit_duration_likely_minutes, editorial_weight, trust, accessibility, destination_id",
      )
      .eq("destination_id", destination.id)
      .order("editorial_weight", { ascending: false })
      .limit(SECTION_LIMIT),
    supabase
      .from("v_published_guidance_blocks")
      .select("id, guidance_type, body_i18n, applies_to_table, applies_to_id, sort_order")
      .eq("applies_to_table", "destinations")
      .eq("applies_to_id", destination.id)
      .order("sort_order"),
    supabase
      .from("v_published_advisories")
      .select("id, title_i18n, body_i18n, severity")
      .eq("destination_id", destination.id),
    supabase.from("v_published_availability_rules").select("experience_id, kind, daily_times"),
  ]);

  const windowsByExperience = groupAvailability(availability.data ?? []);

  const experienceCards = (experiences.data ?? []).map((row) =>
    toExperienceCard(row, locale, windowsByExperience.get(row.id as string) ?? []),
  );
  const placeCards = (places.data ?? []).map((row) => toPlaceCard(row, locale));

  return {
    destination: {
      id: destination.id as string,
      slug: destination.slug as string,
      name: text(destination.name_i18n, locale),
      region: (destination.region as string | null) ?? null,
      overview: text(destination.overview_i18n, locale),
    },
    experiences: experienceCards,
    places: placeCards,
    guidance: (guidance.data ?? []).map((row) => ({
      id: row.id as string,
      guidanceType: row.guidance_type as string,
      body: text(row.body_i18n, locale),
    })),
    advisories: (advisories.data ?? []).map((row) => ({
      id: row.id as string,
      title: text(row.title_i18n, locale),
      body: text(row.body_i18n, locale),
      severity: row.severity as Advisory["severity"],
    })),
    ...collectSources([...experienceCards, ...placeCards]),
  };
}

/** Destination cards for the home screen (PRD F2: up to three, no infinite feed). */
export async function getDestinationCards(locale: string, limit = 3) {
  const supabase = await webSupabase();

  const { data } = await supabase
    .from("v_published_destinations")
    .select("id, slug, name_i18n, region, overview_i18n, editorial_weight")
    .order("editorial_weight", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    slug: row.slug as string,
    name: text(row.name_i18n, locale),
    region: (row.region as string | null) ?? null,
    overview: text(row.overview_i18n, locale),
  }));
}

/** PRD F2: at most 20 cards per section, then "See all". No infinite feeds. */
const SECTION_LIMIT = 20;

function text(value: unknown, locale: string): Text {
  const resolved = getI18n(value as Record<string, string> | null, locale);
  return { text: resolved.text, isFallback: resolved.isFallback };
}

function toExperienceCard(
  row: Record<string, unknown>,
  locale: string,
  availability: AvailabilityWindow[],
): ExperienceCard {
  return {
    id: row["id"] as string,
    slug: row["slug"] as string,
    destinationId: (row["destination_id"] as string | undefined) ?? "",
    name: text(row["name_i18n"], locale),
    experienceType: row["experience_type"] as string,
    significance: text(row["significance_i18n"], locale),
    durationLikelyMinutes: (row["duration_likely_minutes"] as number | null) ?? null,
    advanceBookingRequired: Boolean(row["advance_booking_required"]),
    advanceBookingOpensDaysBefore:
      (row["advance_booking_opens_days_before"] as number | null) ?? null,
    editorialWeight: (row["editorial_weight"] as number | null) ?? 3,
    accessibility: toAccessibility(row["accessibility"], locale),
    trust: (row["trust"] as TrustMap | null) ?? {},
    availability,
  };
}

function toPlaceCard(row: Record<string, unknown>, locale: string): PlaceCard {
  return {
    id: row["id"] as string,
    slug: row["slug"] as string,
    destinationId: (row["destination_id"] as string | undefined) ?? "",
    name: text(row["name_i18n"], locale),
    placeType: row["place_type"] as string,
    facilitySubtype: (row["facility_subtype"] as string | null) ?? null,
    summary: text(row["summary_i18n"], locale),
    visitDurationLikelyMinutes: (row["visit_duration_likely_minutes"] as number | null) ?? null,
    accessibility: toAccessibility(row["accessibility"], locale),
    trust: (row["trust"] as TrustMap | null) ?? {},
  };
}

/** NULL stays null. "Unrecorded" and "has none of these" are different answers (D-080). */
function toAccessibility(value: unknown, locale: string): Accessibility | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;

  return {
    step_free: (record["step_free"] as Accessibility["step_free"]) ?? null,
    wheelchair_access: (record["wheelchair_access"] as Accessibility["wheelchair_access"]) ?? null,
    queue_assistance: (record["queue_assistance"] as boolean | null) ?? null,
    rest_seating: (record["rest_seating"] as boolean | null) ?? null,
    distance_from_dropoff_m: (record["distance_from_dropoff_m"] as number | null) ?? null,
    notes: record["notes_i18n"] ? text(record["notes_i18n"], locale) : null,
  };
}

function groupAvailability(rows: Record<string, unknown>[]) {
  const byExperience = new Map<string, AvailabilityWindow[]>();

  for (const row of rows) {
    const id = row["experience_id"] as string;
    const times = (row["daily_times"] as { start: string; end: string }[] | null) ?? [];

    const windows: AvailabilityWindow[] =
      times.length > 0
        ? times.map((t) => ({ kind: row["kind"] as string, start: t.start, end: t.end }))
        : [{ kind: row["kind"] as string, start: null, end: null }];

    byExperience.set(id, [...(byExperience.get(id) ?? []), ...windows]);
  }

  return byExperience;
}

/**
 * The "Sources & freshness" footer (PRD F9): every source used on the page, and the OLDEST
 * verification across it.
 *
 * Oldest, not newest. The footer is a claim about how current the page is as a whole, and
 * the weakest part of it is what that claim has to be built on.
 */
function collectSources(entities: { trust: TrustMap }[]) {
  const sources = new Map<string, { name: string; tierLabel: string }>();
  let oldest: string | null = null;

  for (const entity of entities) {
    for (const entry of Object.values(entity.trust)) {
      if (entry.source_name) {
        sources.set(entry.source_name, {
          name: entry.source_name,
          tierLabel: entry.source_tier_label ?? "",
        });
      }
      if (entry.verified_at && (!oldest || entry.verified_at < oldest)) {
        oldest = entry.verified_at;
      }
    }
  }

  return { sources: [...sources.values()], oldestVerifiedAt: oldest };
}

// ── Detail pages ─────────────────────────────────────────────────────────────

export type OpeningSchedule = {
  weekly?: Partial<Record<string, [string, string][]>>;
  exceptions?: { date: string; hours?: [string, string][]; closed?: boolean }[];
};

export type PlaceDetail = PlaceCard & {
  destinationSlug: string;
  address: string | null;
  openingSchedule: OpeningSchedule | null;
  closureRules: Text;
  entryRequirements: Text;
  dressCode: Text;
  hoursNote: Text;
  visitDurationMinMinutes: number | null;
  visitDurationMaxMinutes: number | null;
  guidance: GuidanceBlock[];
  /**
   * Where it is, for the Open-in-Maps hand-off (MAPS-03).
   *
   * Null when nothing is recorded, and that is a real state — a place can be published
   * without a pin. The hand-off simply does not render rather than sending someone to
   * coordinates of 0,0 in the Atlantic.
   */
  latitude: number | null;
  longitude: number | null;
};

export type ExperienceDetail = ExperienceCard & {
  destinationSlug: string;
  description: Text;
  eligibility: Text;
  costNote: Text;
  queueExpectation: Text;
  preparation: Text;
  advanceBookingHow: Text;
  isOutdoor: boolean;
  durationMinMinutes: number | null;
  durationMaxMinutes: number | null;
  placeName: Text | null;
  placeSlug: string | null;
  guidance: GuidanceBlock[];
  /*
   * Availability is a CRITICAL field with its own trust record, on the availability rule
   * rather than on the experience (PRD F1). Carried separately so the badge beside a
   * timing is about that timing, and not borrowed from whoever verified the booking note.
   */
  availabilityTrust: TrustEntry | undefined;
};

export async function getPlaceDetail(
  destinationSlug: string,
  slug: string,
  locale: string,
): Promise<PlaceDetail | null> {
  const supabase = await webSupabase();

  const { data } = await supabase
    .from("v_published_places")
    .select(
      "id, slug, name_i18n, place_type, facility_subtype, summary_i18n, address, opening_schedule, closure_rules_i18n, entry_requirements_i18n, dress_code_i18n, hours_note_i18n, visit_duration_min_minutes, visit_duration_likely_minutes, visit_duration_max_minutes, trust, accessibility, destination_id, latitude, longitude",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (!data?.id) return null;
  if (!(await belongsToDestination(data.destination_id, destinationSlug))) return null;

  return {
    ...toPlaceCard(data, locale),
    destinationSlug,
    address: (data.address as string | null) ?? null,
    openingSchedule: (data.opening_schedule as OpeningSchedule | null) ?? null,
    closureRules: text(data.closure_rules_i18n, locale),
    entryRequirements: text(data.entry_requirements_i18n, locale),
    dressCode: text(data.dress_code_i18n, locale),
    hoursNote: text(data.hours_note_i18n, locale),
    visitDurationMinMinutes: (data.visit_duration_min_minutes as number | null) ?? null,
    visitDurationMaxMinutes: (data.visit_duration_max_minutes as number | null) ?? null,
    guidance: await getGuidance("places", data.id as string, locale),
    latitude: (data.latitude as number | null) ?? null,
    longitude: (data.longitude as number | null) ?? null,
  };
}

export async function getExperienceDetail(
  destinationSlug: string,
  slug: string,
  locale: string,
): Promise<ExperienceDetail | null> {
  const supabase = await webSupabase();

  const { data } = await supabase
    .from("v_published_experiences")
    .select(
      "id, slug, name_i18n, experience_type, significance_i18n, description_i18n, duration_min_minutes, duration_likely_minutes, duration_max_minutes, advance_booking_required, advance_booking_how_i18n, advance_booking_opens_days_before, eligibility_i18n, cost_note_i18n, queue_expectation_i18n, preparation_i18n, is_outdoor, editorial_weight, trust, accessibility, destination_id, place_id",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (!data?.id) return null;
  if (!(await belongsToDestination(data.destination_id, destinationSlug))) return null;

  const [availability, place] = await Promise.all([
    supabase
      .from("v_published_availability_rules")
      .select("experience_id, kind, daily_times, trust")
      .eq("experience_id", data.id),
    data.place_id
      ? supabase
          .from("v_published_places")
          .select("slug, name_i18n")
          .eq("id", data.place_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const windows = groupAvailability(availability.data ?? []).get(data.id as string) ?? [];

  return {
    ...toExperienceCard(data, locale, windows),
    destinationSlug,
    description: text(data.description_i18n, locale),
    eligibility: text(data.eligibility_i18n, locale),
    costNote: text(data.cost_note_i18n, locale),
    queueExpectation: text(data.queue_expectation_i18n, locale),
    preparation: text(data.preparation_i18n, locale),
    advanceBookingHow: text(data.advance_booking_how_i18n, locale),
    isOutdoor: Boolean(data.is_outdoor),
    durationMinMinutes: (data.duration_min_minutes as number | null) ?? null,
    durationMaxMinutes: (data.duration_max_minutes as number | null) ?? null,
    placeName: place.data ? text(place.data.name_i18n, locale) : null,
    placeSlug: (place.data?.slug as string | null) ?? null,
    guidance: await getGuidance("experiences", data.id as string, locale),
    // Whole-entity trust on an availability rule has a NULL field name, which the view
    // emits under the key "entity".
    availabilityTrust: ((availability.data?.[0]?.trust ?? {}) as TrustMap)["entity"],
  };
}

/**
 * A detail URL names its destination, and the entity must actually be in it.
 *
 * Without this check `/destinations/a/places/x` would happily render a place belonging to
 * destination `b`. Nothing unpublished leaks either way — the view already guarantees that
 * — but a URL that lies about where something is will end up shared, and then quoted.
 */
async function belongsToDestination(
  destinationId: unknown,
  destinationSlug: string,
): Promise<boolean> {
  const supabase = await webSupabase();

  const { data } = await supabase
    .from("v_published_destinations")
    .select("id")
    .eq("slug", destinationSlug)
    .maybeSingle();

  return Boolean(data?.id) && data?.id === destinationId;
}

async function getGuidance(
  table: "places" | "experiences",
  id: string,
  locale: string,
): Promise<GuidanceBlock[]> {
  const supabase = await webSupabase();

  const { data } = await supabase
    .from("v_published_guidance_blocks")
    .select("id, guidance_type, body_i18n, applies_to_table, applies_to_id, sort_order")
    .eq("applies_to_table", table)
    .eq("applies_to_id", id)
    .order("sort_order");

  return (data ?? []).map((row) => ({
    id: row.id as string,
    guidanceType: row.guidance_type as string,
    body: text(row.body_i18n, locale),
  }));
}

// ── Search (SRCH-01, PRD F2) ─────────────────────────────────────────────────

/**
 * PRD F2's filters. Four of the six are here.
 *
 * "Availability on my dates" and "Near a place I've added" both need an active journey,
 * which arrives with B-019 — PRD F2 caps the visible filters at six rather than requiring
 * six, so shipping the four that can be answered honestly is within the spec. A filter
 * that silently matches everything is worse than an absent one: it teaches a traveler the
 * control does not work.
 */
export type PlaceType = Enums<"place_type_enum">;
export type ExperienceType = Enums<"experience_type_enum">;

/** The values the type filter offers, taken from the generated enums so it cannot drift. */
export const PLACE_TYPES = Constants.public.Enums.place_type_enum;
export const EXPERIENCE_TYPES = Constants.public.Enums.experience_type_enum;

export function isPlaceType(value: string): value is PlaceType {
  return (PLACE_TYPES as readonly string[]).includes(value);
}

export function isExperienceType(value: string): value is ExperienceType {
  return (EXPERIENCE_TYPES as readonly string[]).includes(value);
}

export type SearchFilters = {
  /** One value from either enum — a place type or an experience type, never both. */
  type?: string | undefined;
  /** Only entities recorded as step-free or partly step-free. */
  stepFreeOnly?: boolean | undefined;
  /** Upper bound on the likely duration, in minutes. */
  maxDurationMinutes?: number | undefined;
  /** true = only things needing booking; false = only things that do not. */
  advanceBooking?: boolean | undefined;
};

export type SearchResults = {
  experiences: ExperienceCard[];
  places: PlaceCard[];
  /** True when the query matched nothing AND filters were applied — a different message. */
  filtersApplied: boolean;
};

/**
 * Text search over published knowledge, grouped by kind (PRD A03).
 *
 * `config: "simple"` is not optional. The generated `search_tsv` columns were built with
 * the simple configuration so one column can hold English, Telugu and Devanagari; querying
 * with any other config matches differently from the index and produces results that look
 * arbitrary (0016).
 */
export async function searchKnowledge(
  query: string,
  filters: SearchFilters,
  locale: string,
): Promise<SearchResults> {
  const supabase = await webSupabase();
  const trimmed = query.trim();

  let experienceQuery = supabase
    .from("v_published_experiences")
    .select(
      "id, slug, name_i18n, experience_type, significance_i18n, duration_likely_minutes, advance_booking_required, advance_booking_opens_days_before, editorial_weight, trust, accessibility, destination_id",
    )
    .order("editorial_weight", { ascending: false })
    .limit(SECTION_LIMIT);

  let placeQuery = supabase
    .from("v_published_places")
    .select(
      "id, slug, name_i18n, place_type, facility_subtype, summary_i18n, visit_duration_likely_minutes, editorial_weight, trust, accessibility, destination_id",
    )
    .order("editorial_weight", { ascending: false })
    .limit(SECTION_LIMIT);

  if (trimmed) {
    experienceQuery = experienceQuery.textSearch("search_tsv", trimmed, {
      type: "websearch",
      config: "simple",
    });
    placeQuery = placeQuery.textSearch("search_tsv", trimmed, {
      type: "websearch",
      config: "simple",
    });
  }

  /*
   * One filter over two enums that do not overlap. Choosing "Temple" returns no
   * experiences and choosing "Darshan" returns no places, which is the truthful answer —
   * matching everything in the other group would make the filter look broken, and
   * silently dropping the group would hide that a whole kind of result exists.
   */
  if (filters.type) {
    experienceQuery = isExperienceType(filters.type)
      ? experienceQuery.eq("experience_type", filters.type)
      : experienceQuery.limit(0);

    placeQuery = isPlaceType(filters.type)
      ? placeQuery.eq("place_type", filters.type)
      : placeQuery.limit(0);
  }

  if (filters.maxDurationMinutes) {
    experienceQuery = experienceQuery.lte("duration_likely_minutes", filters.maxDurationMinutes);
    placeQuery = placeQuery.lte("visit_duration_likely_minutes", filters.maxDurationMinutes);
  }

  if (filters.advanceBooking !== undefined) {
    experienceQuery = experienceQuery.eq("advance_booking_required", filters.advanceBooking);
    // A place is not something you book, so a booking filter excludes places entirely
    // rather than pretending every place satisfies it.
    placeQuery = placeQuery.limit(0);
  }

  const [experiences, places] = await Promise.all([experienceQuery, placeQuery]);

  const experienceCards = (experiences.data ?? []).map((row) => toExperienceCard(row, locale, []));
  const placeCards = (places.data ?? []).map((row) => toPlaceCard(row, locale));

  return {
    /*
     * The step-free filter runs here rather than in SQL. Accessibility arrives as a jsonb
     * blob built by `accessibility_for()`, and filtering inside it in PostgREST would mean
     * a `->>` predicate that cannot use an index and reads far worse than this does. The
     * result set is already capped at twenty per kind.
     */
    experiences: filters.stepFreeOnly ? experienceCards.filter(isStepFree) : experienceCards,
    places: filters.stepFreeOnly ? placeCards.filter(isStepFree) : placeCards,
    filtersApplied: Object.values(filters).some((value) => value !== undefined),
  };
}

/**
 * Step-free enough to be worth showing under that filter.
 *
 * `partial` counts as a match. Excluding it would hide "a ramp on the east side, steps
 * elsewhere" from the person most likely to want to know about the ramp — the filter
 * narrows what is shown, and the card still says "partly" so nobody is misled.
 * Unrecorded never matches: a filter is a claim, and we have nothing to claim.
 */
function isStepFree(entity: { accessibility: Accessibility | null }): boolean {
  const value = entity.accessibility?.step_free;
  return value === "yes" || value === "partial";
}

// ── The engine's input bundle ────────────────────────────────────────────────

/**
 * Everything the journey engine may read, for one destination (D-005).
 *
 * This is the SAME type the Dexie snapshot will hold in B-023 and the same shape the
 * snapshot API returns — one type, so the engine behaves identically online and offline
 * because there is no second code path to keep in step.
 *
 * Locale is resolved here rather than in the engine: the engine renders no language, and
 * fields like `advance_booking_how` reach it already in the traveler's own words.
 */
export async function getKnowledgeBundle(
  destinationId: string,
  locale: string,
): Promise<KnowledgeBundle> {
  const supabase = await webSupabase();

  const [places, experiences, rules, routes, transport, estimates] = await Promise.all([
    supabase
      .from("v_published_places")
      .select(
        "id, opening_schedule, dress_code_i18n, entry_requirements_i18n, visit_duration_min_minutes, visit_duration_likely_minutes, visit_duration_max_minutes, accessibility",
      )
      .eq("destination_id", destinationId),
    supabase
      .from("v_published_experiences")
      .select(
        "id, place_id, route_id, duration_min_minutes, duration_likely_minutes, duration_max_minutes, is_outdoor, advance_booking_required, advance_booking_how_i18n, advance_booking_opens_days_before",
      )
      .eq("destination_id", destinationId),
    supabase
      .from("v_published_availability_rules")
      .select(
        "id, experience_id, kind, daily_times, weekly_pattern, date_start, date_end, calendar_dates, priority, valid_from, valid_to",
      ),
    supabase
      .from("v_published_routes")
      .select("id, distance_m, duration_likely_minutes, duration_max_minutes")
      .eq("destination_id", destinationId),
    supabase
      .from("v_published_transport_connections")
      .select("id, from_place_id, to_place_id, mode, duration_likely_minutes, duration_max_minutes")
      .eq("destination_id", destinationId),
    supabase
      .from("v_published_travel_estimates")
      .select("from_place_id, to_place_id, mode, distance_m, duration_seconds"),
  ]);

  return {
    places: (places.data ?? []).map((row) => ({
      id: row.id as string,
      // `?? null` throughout: the view returns a nullable column, and the engine models
      // "not recorded" as null rather than as an absent property (exactOptionalPropertyTypes).
      opening_schedule:
        (row.opening_schedule as KnowledgeBundle["places"][number]["opening_schedule"]) ?? null,
      dress_code: text(row.dress_code_i18n, locale).text || null,
      entry_requirements: text(row.entry_requirements_i18n, locale).text || null,
      step_free: stepFreeOf(row.accessibility),
      visit_duration_min_minutes: row.visit_duration_min_minutes,
      visit_duration_likely_minutes: row.visit_duration_likely_minutes,
      visit_duration_max_minutes: row.visit_duration_max_minutes,
    })),
    experiences: (experiences.data ?? []).map((row) => ({
      id: row.id as string,
      place_id: row.place_id,
      route_id: row.route_id,
      duration_min_minutes: row.duration_min_minutes,
      duration_likely_minutes: row.duration_likely_minutes,
      duration_max_minutes: row.duration_max_minutes,
      is_outdoor: row.is_outdoor ?? false,
      advance_booking_required: row.advance_booking_required ?? false,
      advance_booking_how: text(row.advance_booking_how_i18n, locale).text || null,
      advance_booking_opens_days_before: row.advance_booking_opens_days_before,
    })),
    availability_rules: (rules.data ?? []).map((row) => ({
      id: row.id as string,
      experience_id: row.experience_id as string,
      kind: row.kind as KnowledgeBundle["availability_rules"][number]["kind"],
      daily_times:
        (row.daily_times as KnowledgeBundle["availability_rules"][number]["daily_times"]) ?? null,
      weekly_pattern:
        (row.weekly_pattern as KnowledgeBundle["availability_rules"][number]["weekly_pattern"]) ??
        null,
      date_start: row.date_start,
      date_end: row.date_end,
      calendar_dates: row.calendar_dates,
      priority: row.priority ?? 1,
      valid_from: row.valid_from,
      valid_to: row.valid_to,
    })),
    routes: (routes.data ?? []).map((row) => ({
      id: row.id as string,
      distance_m: row.distance_m,
      duration_likely_minutes: row.duration_likely_minutes,
      duration_max_minutes: row.duration_max_minutes,
    })),
    transport_connections: (transport.data ?? []).map((row) => ({
      id: row.id as string,
      from_place_id: row.from_place_id,
      to_place_id: row.to_place_id,
      mode: row.mode as KnowledgeBundle["transport_connections"][number]["mode"],
      duration_likely_minutes: row.duration_likely_minutes,
      duration_max_minutes: row.duration_max_minutes,
    })),
    travel_estimates: (estimates.data ?? []).map((row) => ({
      from_place_id: row.from_place_id as string,
      to_place_id: row.to_place_id as string,
      mode: row.mode as KnowledgeBundle["transport_connections"][number]["mode"],
      distance_m: row.distance_m,
      duration_seconds: row.duration_seconds,
    })),
    trust: {},
  };
}

/** The engine reads one accessibility field; the rest is presentation. */
function stepFreeOf(value: unknown): "yes" | "no" | "partial" | null {
  if (!value || typeof value !== "object") return null;
  const step = (value as Record<string, unknown>)["step_free"];
  return step === "yes" || step === "no" || step === "partial" ? step : null;
}
