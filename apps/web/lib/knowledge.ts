import { Constants, type Enums } from "@mandhira/db";
import type { Database } from "@mandhira/db/types";
import {
  resolveAvailability,
  weekdayOf,
  type AvailabilityRule,
  type KnowledgeBundle,
} from "@mandhira/journey-engine";
import { getI18n } from "@mandhira/i18n";

import { mustList, mustMaybe } from "./data-error";
import { rankByJourneyFit, type JourneyToFit } from "./journey-fit";
import { affinitiesFrom, rankByAffinity, type Affinity, type ShownReason } from "./personalization";
import { readSignals } from "./signals";
import { webSupabase } from "./supabase";
import type { TrustEntry, TrustMap } from "./trust";
import { nextOccurrence, todayIn, type NextOccurrence } from "./next-occurrence";

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
  /** Set by search when the traveler has a journey: this could go into it (PRD-DISC-006). */
  fitsJourney?: boolean;
  /**
   * Why this is where it is, when the traveler's own explicit signals moved it up
   * (PRD-ACCT-004). Null unless they genuinely did — see `rankByAffinity`.
   */
  because?: ShownReason | null;
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
  /** Set by search when the traveler has a journey: this could go into it (PRD-DISC-006). */
  fitsJourney?: boolean;
  /** As on PlaceCard: what the traveler told us that lifted this (PRD-ACCT-004). */
  because?: ShownReason | null;
};

export type AvailabilityWindow = { kind: string; start: string | null; end: string | null };

export type Advisory = {
  id: string;
  title: Text;
  body: Text;
  severity: "info" | "caution" | "important";
  /**
   * When Ops last published it (PRD F10). An advisory is DYNAMIC, curated information, and
   * F10 labels that category "Updated [date]" so a traveler can tell a notice written this
   * morning from one written last season. `published_at` is stamped on every publish, so
   * a revised advisory carries the revision's date rather than the first one's.
   */
  updatedAt: string | null;
};

export type GuidanceBlock = { id: string; guidanceType: string; body: Text };

/** A ritual, festival or event on the destination page, with when it next happens. */
export type RitualCard = {
  id: string;
  slug: string;
  name: Text;
  experienceType: string;
  significance: Text;
  next: NextOccurrence | null;
};

export type TransportMode = "walk" | "vehicle" | "public_transport" | "hired" | "other";

/** One published way of getting there or around (PRD F2 "Getting there & around"). */
export type TransportLine = {
  id: string;
  mode: TransportMode;
  durationLikelyMinutes: number | null;
  operator: string | null;
  frequency: Text;
};

/** A published destination worth the journey from this one (PRD F2). */
export type NearbyDestination = { slug: string; name: Text; region: string | null; note: Text };

/** Rituals and events: the experience types that happen on a date rather than whenever. */
const RITUAL_TYPES = ["ritual", "aarti", "seva", "festival", "event"] as const;

export type DestinationPage = {
  destination: DestinationSummary;
  experiences: ExperienceCard[];
  places: PlaceCard[];
  /** How many are published in all, so a section can offer "See all" past its first 20. */
  experienceTotal: number;
  placeTotal: number;
  rituals: RitualCard[];
  seasons: { best: Text; notes: Text };
  /**
   * PRD F2's accessibility summary, over the places listed: how many were checked, how many
   * of those are step-free or partly, and any accessibility guidance Ops wrote.
   */
  accessibilitySummary: { recorded: number; stepFree: number; notes: GuidanceBlock[] };
  transport: TransportLine[];
  nearby: NearbyDestination[];
  /** Practical essentials: every guidance block except accessibility, which has its own section. */
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

  const destination = mustMaybe(
    await supabase
      .from("v_published_destinations")
      .select("id, slug, name_i18n, region, overview_i18n, best_seasons_i18n, seasonal_notes_i18n")
      .eq("slug", slug)
      .maybeSingle(),
    "v_published_destinations",
  );

  if (!destination?.id) return null;

  const [
    experiencesResult,
    placesResult,
    guidanceResult,
    advisoriesResult,
    availabilityResult,
    ritualsResult,
    transportResult,
    nearbyResult,
  ] = await Promise.all([
    supabase
      .from("v_published_experiences")
      // One string literal, not a concatenation: the client infers the row shape from the
      // literal type, and a joined string degrades it to an opaque error type.
      .select(
        "id, slug, name_i18n, experience_type, significance_i18n, duration_likely_minutes, advance_booking_required, advance_booking_opens_days_before, editorial_weight, trust, accessibility, destination_id",
        { count: "exact" },
      )
      .eq("destination_id", destination.id)
      // PRD F2: ranked by the editorial weight Ops set, never by popularity.
      .order("editorial_weight", { ascending: false })
      .limit(SECTION_LIMIT),
    supabase
      .from("v_published_places")
      .select(
        "id, slug, name_i18n, place_type, facility_subtype, summary_i18n, visit_duration_likely_minutes, editorial_weight, trust, accessibility, destination_id",
        { count: "exact" },
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
      .select("id, title_i18n, body_i18n, severity, published_at")
      .eq("destination_id", destination.id),
    supabase
      .from("v_published_availability_rules")
      .select(
        "id, experience_id, kind, daily_times, weekly_pattern, date_start, date_end, calendar_dates, priority, valid_from, valid_to",
      ),
    supabase
      .from("v_published_experiences")
      .select("id, slug, name_i18n, experience_type, significance_i18n")
      .eq("destination_id", destination.id)
      .in("experience_type", [...RITUAL_TYPES])
      .order("editorial_weight", { ascending: false })
      .limit(SECTION_LIMIT),
    supabase
      .from("v_published_transport_connections")
      .select("id, mode, duration_likely_minutes, operator, frequency_note_i18n")
      .or(`destination_id.eq.${destination.id},to_destination_id.eq.${destination.id}`)
      .limit(SECTION_LIMIT),
    supabase
      .from("v_published_destination_links")
      .select("nearby_slug, nearby_name_i18n, nearby_region, note_i18n")
      .eq("destination_id", destination.id)
      .order("nearby_editorial_weight", { ascending: false })
      .limit(SECTION_LIMIT),
  ]);

  const experiences = mustList(experiencesResult, "v_published_experiences");
  const places = mustList(placesResult, "v_published_places");
  const guidance = mustList(guidanceResult, "v_published_guidance_blocks");
  const advisories = mustList(advisoriesResult, "v_published_advisories");
  const availability = mustList(availabilityResult, "v_published_availability_rules");
  const ritualRows = mustList(ritualsResult, "v_published_experiences");
  const transportRows = mustList(transportResult, "v_published_transport_connections");
  const nearbyRows = mustList(nearbyResult, "v_published_destination_links");

  const today = todayIn();
  const guidanceBlocks = guidance.map((row) => ({
    id: row.id as string,
    guidanceType: row.guidance_type as string,
    body: text(row.body_i18n, locale),
  }));

  const windowsByExperience = groupAvailability(availability);

  const experienceCards = experiences.map((row) =>
    toExperienceCard(row, locale, windowsByExperience.get(row.id as string) ?? []),
  );
  const placeCards = places.map((row) => toPlaceCard(row, locale));

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
    experienceTotal: experiencesResult.count ?? experienceCards.length,
    placeTotal: placesResult.count ?? placeCards.length,
    rituals: ritualRows.map((row) => ({
      id: row.id as string,
      slug: row.slug as string,
      name: text(row.name_i18n, locale),
      experienceType: row.experience_type as string,
      significance: text(row.significance_i18n, locale),
      next: nextOccurrence(
        availability.filter(
          (rule) => rule.experience_id === row.id,
        ) as unknown as AvailabilityRule[],
        today,
      ),
    })),
    seasons: {
      best: text(destination.best_seasons_i18n, locale),
      notes: text(destination.seasonal_notes_i18n, locale),
    },
    accessibilitySummary: {
      recorded: placeCards.filter((place) => place.accessibility?.step_free).length,
      stepFree: placeCards.filter(
        (place) =>
          place.accessibility?.step_free === "yes" || place.accessibility?.step_free === "partial",
      ).length,
      notes: guidanceBlocks.filter((block) => block.guidanceType === "accessibility"),
    },
    transport: transportRows.map((row) => ({
      id: row.id as string,
      mode: (row.mode as TransportMode | null) ?? "other",
      durationLikelyMinutes: (row.duration_likely_minutes as number | null) ?? null,
      operator: (row.operator as string | null) ?? null,
      frequency: text(row.frequency_note_i18n, locale),
    })),
    nearby: nearbyRows.map((row) => ({
      slug: row.nearby_slug as string,
      name: text(row.nearby_name_i18n, locale),
      region: (row.nearby_region as string | null) ?? null,
      note: text(row.note_i18n, locale),
    })),
    guidance: guidanceBlocks.filter((block) => block.guidanceType !== "accessibility"),
    advisories: advisories.map((row) => ({
      id: row.id as string,
      title: text(row.title_i18n, locale),
      body: text(row.body_i18n, locale),
      severity: row.severity as Advisory["severity"],
      updatedAt: (row.published_at as string | null) ?? null,
    })),
    ...collectSources([...experienceCards, ...placeCards]),
  };
}

/** Destination cards for the home screen (PRD F2: up to three, no infinite feed). */
export async function getDestinationCards(locale: string, limit = 3) {
  const supabase = await webSupabase();

  const data = mustList(
    await supabase
      .from("v_published_destinations")
      .select("id, slug, name_i18n, region, overview_i18n, editorial_weight")
      .order("editorial_weight", { ascending: false })
      .limit(limit),
    "v_published_destinations",
  );

  return data.map((row) => ({
    id: row.id as string,
    slug: row.slug as string,
    name: text(row.name_i18n, locale),
    region: (row.region as string | null) ?? null,
    overview: text(row.overview_i18n, locale),
  }));
}

/** PRD F2: at most 20 cards per section, then "See all". No infinite feeds. */
export const SECTION_LIMIT = 20;

/** Rows a search reads when a filter is applied in code after the read (date, near, step-free). */
const POST_FILTER_WINDOW = 200;

export type DestinationSection<T> = {
  destination: DestinationSummary;
  cards: T[];
  total: number;
  page: number;
  pageCount: number;
};

/** "See all" for a destination's experiences, twenty at a time in editorial order (PRD F2). */
export async function getDestinationExperiencesPage(
  slug: string,
  page: number,
  locale: string,
): Promise<DestinationSection<ExperienceCard> | null> {
  const destination = await publishedDestination(slug, locale);
  if (!destination) return null;

  const supabase = await webSupabase();
  const window = pageWindow(page);

  const result = await supabase
    .from("v_published_experiences")
    .select(
      "id, slug, name_i18n, experience_type, significance_i18n, duration_likely_minutes, advance_booking_required, advance_booking_opens_days_before, editorial_weight, trust, accessibility, destination_id",
      { count: "exact" },
    )
    .eq("destination_id", destination.id)
    .order("editorial_weight", { ascending: false })
    // A tiebreak, so equal weights cannot swap places between one page and the next.
    .order("id")
    .range(window.from, window.to);

  const rows = mustList(result, "v_published_experiences");
  const ids = rows.map((row) => row.id).filter((id): id is string => !!id);
  const availability = ids.length
    ? mustList(
        await supabase
          .from("v_published_availability_rules")
          .select("experience_id, kind, daily_times")
          .in("experience_id", ids),
        "v_published_availability_rules",
      )
    : [];
  const windows = groupAvailability(availability);

  return sectionOf(
    destination,
    rows.map((row) => toExperienceCard(row, locale, windows.get(row.id as string) ?? [])),
    result.count,
    window.page,
  );
}

/** "See all" for a destination's places. */
export async function getDestinationPlacesPage(
  slug: string,
  page: number,
  locale: string,
): Promise<DestinationSection<PlaceCard> | null> {
  const destination = await publishedDestination(slug, locale);
  if (!destination) return null;

  const supabase = await webSupabase();
  const window = pageWindow(page);

  const result = await supabase
    .from("v_published_places")
    .select(
      "id, slug, name_i18n, place_type, facility_subtype, summary_i18n, visit_duration_likely_minutes, editorial_weight, trust, accessibility, destination_id",
      { count: "exact" },
    )
    .eq("destination_id", destination.id)
    .order("editorial_weight", { ascending: false })
    .order("id")
    .range(window.from, window.to);

  const rows = mustList(result, "v_published_places");

  return sectionOf(
    destination,
    rows.map((row) => toPlaceCard(row, locale)),
    result.count,
    window.page,
  );
}

async function publishedDestination(
  slug: string,
  locale: string,
): Promise<DestinationSummary | null> {
  const supabase = await webSupabase();

  const row = mustMaybe(
    await supabase
      .from("v_published_destinations")
      .select("id, slug, name_i18n, region, overview_i18n")
      .eq("slug", slug)
      .maybeSingle(),
    "v_published_destinations",
  );

  if (!row?.id) return null;

  return {
    id: row.id as string,
    slug: row.slug as string,
    name: text(row.name_i18n, locale),
    region: (row.region as string | null) ?? null,
    overview: text(row.overview_i18n, locale),
  };
}

function pageWindow(page: number) {
  const safe = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  const from = (safe - 1) * SECTION_LIMIT;
  return { page: safe, from, to: from + SECTION_LIMIT - 1 };
}

function sectionOf<T>(
  destination: DestinationSummary,
  cards: T[],
  count: number | null,
  page: number,
): DestinationSection<T> {
  const total = count ?? cards.length;
  return {
    destination,
    cards,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / SECTION_LIMIT)),
  };
}

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
  /** Every source behind the page and the oldest confirmation, for the footer (PRD F9). */
  sources: { name: string; tierLabel: string }[];
  oldestVerifiedAt: string | null;
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
  /** Every source behind the page and the oldest confirmation, for the footer (PRD F9). */
  sources: { name: string; tierLabel: string }[];
  oldestVerifiedAt: string | null;
};

export async function getPlaceDetail(
  destinationSlug: string,
  slug: string,
  locale: string,
): Promise<PlaceDetail | null> {
  const supabase = await webSupabase();

  const destinationId = await destinationIdFor(destinationSlug);
  if (!destinationId) return null;

  const data = mustMaybe(
    await supabase
      .from("v_published_places")
      .select(
        "id, slug, name_i18n, place_type, facility_subtype, summary_i18n, address, opening_schedule, closure_rules_i18n, entry_requirements_i18n, dress_code_i18n, hours_note_i18n, visit_duration_min_minutes, visit_duration_likely_minutes, visit_duration_max_minutes, trust, accessibility, destination_id, latitude, longitude",
      )
      .eq("destination_id", destinationId)
      .eq("slug", slug)
      .maybeSingle(),
    "v_published_places",
  );

  if (!data?.id) return null;

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
    ...collectSources([toPlaceCard(data, locale)]),
  };
}

export async function getExperienceDetail(
  destinationSlug: string,
  slug: string,
  locale: string,
): Promise<ExperienceDetail | null> {
  const supabase = await webSupabase();

  const destinationId = await destinationIdFor(destinationSlug);
  if (!destinationId) return null;

  const data = mustMaybe(
    await supabase
      .from("v_published_experiences")
      .select(
        "id, slug, name_i18n, experience_type, significance_i18n, description_i18n, duration_min_minutes, duration_likely_minutes, duration_max_minutes, advance_booking_required, advance_booking_how_i18n, advance_booking_opens_days_before, eligibility_i18n, cost_note_i18n, queue_expectation_i18n, preparation_i18n, is_outdoor, editorial_weight, trust, accessibility, destination_id, place_id",
      )
      .eq("destination_id", destinationId)
      .eq("slug", slug)
      .maybeSingle(),
    "v_published_experiences",
  );

  if (!data?.id) return null;

  const [availabilityResult, placeResult] = await Promise.all([
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
      : Promise.resolve({ data: null, error: null }),
  ]);

  const availability = mustList(availabilityResult, "v_published_availability_rules");
  const place = { data: mustMaybe(placeResult, "v_published_places") };

  const windows = groupAvailability(availability).get(data.id as string) ?? [];

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
    availabilityTrust: ((availability[0]?.trust ?? {}) as TrustMap)["entity"],
    ...collectSources([
      toExperienceCard(data, locale, windows),
      { trust: (availability[0]?.trust ?? {}) as TrustMap },
    ]),
  };
}

/**
 * A detail URL names its destination, and the entity must actually be in it.
 *
 * Without this check `/destinations/a/places/x` would happily render a place belonging to
 * destination `b`. Nothing unpublished leaks either way — the view already guarantees that
 * — but a URL that lies about where something is will end up shared, and then quoted.
 * Slugs are only unique within a destination, so the entity is looked up inside it.
 */
async function destinationIdFor(destinationSlug: string): Promise<string | null> {
  const supabase = await webSupabase();

  const data = mustMaybe(
    await supabase
      .from("v_published_destinations")
      .select("id")
      .eq("slug", destinationSlug)
      .maybeSingle(),
    "v_published_destinations",
  );

  return data?.id ?? null;
}

async function getGuidance(
  table: "places" | "experiences",
  id: string,
  locale: string,
): Promise<GuidanceBlock[]> {
  const supabase = await webSupabase();

  const data = mustList(
    await supabase
      .from("v_published_guidance_blocks")
      .select("id, guidance_type, body_i18n, applies_to_table, applies_to_id, sort_order")
      .eq("applies_to_table", table)
      .eq("applies_to_id", id)
      .order("sort_order"),
    "v_published_guidance_blocks",
  );

  return data.map((row) => ({
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
  /** YYYY-MM-DD: only what is running (experiences) or open (places) that day. */
  availableOn?: string | undefined;
  /** One of the traveler's journeys: only what is within walking distance of a place in it. */
  nearJourneyId?: string | undefined;
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
  /** The traveler's journey under way or ahead, when there is one (PRD-DISC-006). */
  fit: JourneyToFit | null = null,
): Promise<SearchResults> {
  const supabase = await webSupabase();
  const trimmed = query.trim();

  /*
   * Date, nearness and step-free are decided in code, after the read. Capping the read at
   * twenty first would filter those twenty and show fewer — often none — while matches sat
   * just past the cap. So a filtered search reads a wider window and caps what survives.
   */
  const postFiltered = !!(filters.availableOn || filters.nearJourneyId || filters.stepFreeOnly);
  const readLimit = postFiltered ? POST_FILTER_WINDOW : SECTION_LIMIT;

  let experienceQuery = supabase
    .from("v_published_experiences")
    .select(
      "id, slug, name_i18n, experience_type, significance_i18n, duration_likely_minutes, advance_booking_required, advance_booking_opens_days_before, editorial_weight, trust, accessibility, destination_id, place_id",
    )
    .order("editorial_weight", { ascending: false })
    .limit(readLimit);

  let placeQuery = supabase
    .from("v_published_places")
    .select(
      "id, slug, name_i18n, place_type, facility_subtype, summary_i18n, visit_duration_likely_minutes, editorial_weight, trust, accessibility, destination_id, latitude, longitude, opening_schedule",
    )
    .order("editorial_weight", { ascending: false })
    .limit(readLimit);

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

  let experienceRows = mustList(experiences, "v_published_experiences");
  let placeRows = mustList(places, "v_published_places");

  if (filters.availableOn || filters.nearJourneyId) {
    const hosts = await hostPlaces(
      supabase,
      experienceRows.map((row) => row.place_id),
    );

    if (filters.availableOn) {
      const date = filters.availableOn;
      const rules = await availabilityRulesFor(
        supabase,
        experienceRows.map((row) => row.id),
      );

      experienceRows = experienceRows.filter(
        (row) =>
          resolveAvailability({
            rules: rules.filter((rule) => rule.experience_id === row.id),
            date,
            openingSchedule: row.place_id
              ? (hosts.get(row.place_id)?.openingSchedule ?? null)
              : null,
          }).available,
      );
      placeRows = placeRows.filter((row) =>
        openOn(row.opening_schedule as OpeningSchedule | null, date),
      );
    }

    if (filters.nearJourneyId) {
      const anchors = await journeyAnchors(supabase, filters.nearJourneyId);
      experienceRows = experienceRows.filter((row) =>
        isNear(row.place_id ? hosts.get(row.place_id) : undefined, anchors),
      );
      placeRows = placeRows.filter((row) => isNear(row, anchors));
    }
  }

  /*
   * "Fits your journey" first (PRD-DISC-006): ranked, never filtered, after every filter has
   * run, so the cap below keeps the fitting results rather than cutting them.
   */
  const fitting = fit ? await journeyFit(supabase, fit, experienceRows, placeRows) : null;

  /*
   * PRD-ACCT-004, applied LAST and as a tie-breaker only.
   *
   * Order of authority: what fits the journey they are actually planning, then editorial
   * weight, then what they have told us about themselves. Putting personalization last
   * means it reorders within what the editors and the journey already decided rather than
   * over them — a traveler cannot end up in a loop of their own past choices.
   */
  const affinities = affinitiesFrom(await readSignals(supabase), Date.now());
  const experienceCards = withAffinity(
    rankIfFitting(
      experienceRows.map((row) => toExperienceCard(row, locale, [])),
      fitting?.experiences,
    ),
    affinities,
  );
  const placeCards = withAffinity(
    rankIfFitting(
      placeRows.map((row) => toPlaceCard(row, locale)),
      fitting?.places,
    ),
    affinities,
  );

  return {
    /*
     * The step-free filter runs here rather than in SQL. Accessibility arrives as a jsonb
     * blob built by `accessibility_for()`, and filtering inside it in PostgREST would mean
     * a `->>` predicate that cannot use an index and reads far worse than this does. The
     * read is bounded by POST_FILTER_WINDOW, and the cap of twenty applies to what survives.
     */
    experiences: (filters.stepFreeOnly
      ? experienceCards.filter(isStepFree)
      : experienceCards
    ).slice(0, SECTION_LIMIT),
    places: (filters.stepFreeOnly ? placeCards.filter(isStepFree) : placeCards).slice(
      0,
      SECTION_LIMIT,
    ),
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
/*
 * The two journey-aware filters (PRD F2). Both are claims, so both answer no when nothing is
 * recorded: an experience with no availability rules is not "running on your date", and a
 * place with no pin is not near anything.
 */
type Client = Awaited<ReturnType<typeof webSupabase>>;
type Point = { latitude: number | null; longitude: number | null };

/** Roughly a twenty-minute walk: near enough to fit around what is already planned. */
const NEAR_METRES = 2000;

/** Which results could go into the journey: at its destination, and open or running on one of its days. */
async function journeyFit(
  supabase: Client,
  fit: JourneyToFit,
  experienceRows: { id: string | null; destination_id: string | null; place_id: string | null }[],
  placeRows: { id: string | null; destination_id: string | null; opening_schedule: unknown }[],
): Promise<{ experiences: Set<string>; places: Set<string> }> {
  const here = experienceRows.filter((row) => row.destination_id === fit.destinationId);
  const [hosts, rules] = await Promise.all([
    hostPlaces(
      supabase,
      here.map((row) => row.place_id),
    ),
    availabilityRulesFor(
      supabase,
      here.map((row) => row.id),
    ),
  ]);

  const experiences = new Set(
    here
      .filter((row) =>
        fit.dates.some(
          (date) =>
            resolveAvailability({
              rules: rules.filter((rule) => rule.experience_id === row.id),
              date,
              openingSchedule: row.place_id
                ? (hosts.get(row.place_id)?.openingSchedule ?? null)
                : null,
            }).available,
        ),
      )
      .map((row) => row.id)
      .filter((id): id is string => !!id),
  );

  const places = new Set(
    placeRows
      .filter(
        (row) =>
          row.destination_id === fit.destinationId &&
          fit.dates.some((date) => openOn(row.opening_schedule as OpeningSchedule | null, date)),
      )
      .map((row) => row.id)
      .filter((id): id is string => !!id),
  );

  return { experiences, places };
}

/** Reorders by the traveler's own signals and hands each card its reason. */
function withAffinity<T extends { id: string; because?: ShownReason | null }>(
  cards: T[],
  affinities: Map<string, Affinity>,
): T[] {
  if (affinities.size === 0) return cards;
  return rankByAffinity(cards, (card) => card.id, affinities).map((ranked) => ({
    ...ranked.item,
    because: ranked.because,
  }));
}

function rankIfFitting<T extends { id: string }>(
  cards: T[],
  fitting: Set<string> | undefined,
): T[] {
  return fitting ? rankByJourneyFit(cards, (card) => fitting.has(card.id)) : cards;
}

async function hostPlaces(
  supabase: Client,
  ids: (string | null)[],
): Promise<Map<string, Point & { openingSchedule: OpeningSchedule | null }>> {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))];
  if (wanted.length === 0) return new Map();

  const rows = mustList(
    await supabase
      .from("v_published_places")
      .select("id, latitude, longitude, opening_schedule")
      .in("id", wanted),
    "v_published_places",
  );

  return new Map(
    rows.map((row) => [
      row.id as string,
      {
        latitude: row.latitude,
        longitude: row.longitude,
        openingSchedule: (row.opening_schedule as OpeningSchedule | null) ?? null,
      },
    ]),
  );
}

async function availabilityRulesFor(
  supabase: Client,
  ids: (string | null)[],
): Promise<AvailabilityRule[]> {
  const wanted = ids.filter((id): id is string => !!id);
  if (wanted.length === 0) return [];

  const rows = mustList(
    await supabase
      .from("v_published_availability_rules")
      .select(
        "id, experience_id, kind, daily_times, weekly_pattern, date_start, date_end, calendar_dates, priority, valid_from, valid_to",
      )
      .in("experience_id", wanted),
    "v_published_availability_rules",
  );

  return rows.map(toAvailabilityRule);
}

/** Where the journey already goes, read as the traveler, so another traveler's journey yields nothing. */
async function journeyAnchors(
  supabase: Client,
  journeyId: string,
): Promise<{ latitude: number; longitude: number }[]> {
  const items = mustList(
    await supabase
      .from("journey_items")
      .select("place_id")
      .eq("journey_id", journeyId)
      .is("deleted_at", null),
    "journey_items",
  );

  const placeIds = [
    ...new Set(items.map((row) => row.place_id).filter((id): id is string => !!id)),
  ];
  if (placeIds.length === 0) return [];

  const places = mustList(
    await supabase.from("v_published_places").select("latitude, longitude").in("id", placeIds),
    "v_published_places",
  );

  return places.flatMap((place) =>
    place.latitude != null && place.longitude != null
      ? [{ latitude: place.latitude, longitude: place.longitude }]
      : [],
  );
}

function openOn(schedule: OpeningSchedule | null, date: string): boolean {
  if (!schedule) return false;

  const exception = schedule.exceptions?.find((entry) => entry.date === date);
  if (exception?.closed) return false;
  if (exception?.hours) return exception.hours.length > 0;

  return (schedule.weekly?.[weekdayOf(date)]?.length ?? 0) > 0;
}

function isNear(point: Point | undefined, anchors: { latitude: number; longitude: number }[]) {
  if (point?.latitude == null || point.longitude == null) return false;
  const here = { latitude: point.latitude, longitude: point.longitude };
  return anchors.some((anchor) => metresBetween(here, anchor) <= NEAR_METRES);
}

function metresBetween(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

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

  const results = await Promise.all([
    supabase
      .from("v_published_places")
      .select(
        "id, opening_schedule, dress_code_i18n, entry_requirements_i18n, visit_duration_min_minutes, visit_duration_likely_minutes, visit_duration_max_minutes, accessibility, trust",
      )
      .eq("destination_id", destinationId),
    supabase
      .from("v_published_experiences")
      .select(
        "id, place_id, route_id, duration_min_minutes, duration_likely_minutes, duration_max_minutes, is_outdoor, advance_booking_required, advance_booking_how_i18n, advance_booking_opens_days_before, trust",
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

  const places = mustList(results[0], "v_published_places");
  const experiences = mustList(results[1], "v_published_experiences");
  const rules = mustList(results[2], "v_published_availability_rules");
  const routes = mustList(results[3], "v_published_routes");
  const transport = mustList(results[4], "v_published_transport_connections");
  const estimates = mustList(results[5], "v_published_travel_estimates");

  return {
    places: places.map((row) => ({
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
    experiences: experiences.map((row) => ({
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
    availability_rules: rules.map(toAvailabilityRule),
    routes: routes.map((row) => ({
      id: row.id as string,
      distance_m: row.distance_m,
      duration_likely_minutes: row.duration_likely_minutes,
      duration_max_minutes: row.duration_max_minutes,
    })),
    transport_connections: transport.map((row) => ({
      id: row.id as string,
      from_place_id: row.from_place_id,
      to_place_id: row.to_place_id,
      mode: row.mode as KnowledgeBundle["transport_connections"][number]["mode"],
      duration_likely_minutes: row.duration_likely_minutes,
      duration_max_minutes: row.duration_max_minutes,
    })),
    travel_estimates: estimates.map((row) => ({
      from_place_id: row.from_place_id as string,
      to_place_id: row.to_place_id as string,
      mode: row.mode as KnowledgeBundle["transport_connections"][number]["mode"],
      distance_m: row.distance_m,
      duration_seconds: row.duration_seconds,
    })),
    /*
     * Trust by entity id, from the published views. Journey Health reports low-confidence and
     * conflicting critical information from this (PRD F5 check 5), and the journey screen notes
     * stale fields (PRD-TRST-004). It was left empty, so neither ever fired.
     */
    trust: Object.fromEntries(
      [...places, ...experiences].map((row) => [
        row.id as string,
        (row.trust as TrustMap | null) ?? {},
      ]),
    ),
  };
}

type AvailabilityRuleRow = Pick<
  Database["public"]["Views"]["v_published_availability_rules"]["Row"],
  | "id"
  | "experience_id"
  | "kind"
  | "daily_times"
  | "weekly_pattern"
  | "date_start"
  | "date_end"
  | "calendar_dates"
  | "priority"
  | "valid_from"
  | "valid_to"
>;

function toAvailabilityRule(row: AvailabilityRuleRow): AvailabilityRule {
  return {
    id: row.id as string,
    experience_id: row.experience_id as string,
    kind: row.kind as AvailabilityRule["kind"],
    daily_times: (row.daily_times as AvailabilityRule["daily_times"]) ?? null,
    weekly_pattern: (row.weekly_pattern as AvailabilityRule["weekly_pattern"]) ?? null,
    date_start: row.date_start,
    date_end: row.date_end,
    calendar_dates: row.calendar_dates,
    priority: row.priority ?? 1,
    valid_from: row.valid_from,
    valid_to: row.valid_to,
  };
}

/** The engine reads one accessibility field; the rest is presentation. */
function stepFreeOf(value: unknown): "yes" | "no" | "partial" | null {
  if (!value || typeof value !== "object") return null;
  const step = (value as Record<string, unknown>)["step_free"];
  return step === "yes" || step === "no" || step === "partial" ? step : null;
}

/** An advisory as a journey shows it (PRD A25): with its dates and its source. */
export type JourneyAdvisory = Advisory & {
  startsAt: string | null;
  endsAt: string | null;
  sourceName: string | null;
};

/**
 * Published advisories for a journey's destination whose window touches its days (PRD A25,
 * PRD F15). The same set 0045 notifies about, so the notice a traveler taps through to is
 * on the journey they land on.
 */
export async function getJourneyAdvisories(
  destinationId: string,
  startDate: string | null,
  endDate: string | null,
  locale: string,
): Promise<JourneyAdvisory[]> {
  const supabase = await webSupabase();
  const rows = mustList(
    await supabase
      .from("v_published_advisories")
      .select("id, title_i18n, body_i18n, severity, starts_at, ends_at, trust, published_at")
      .eq("destination_id", destinationId)
      .order("starts_at", { ascending: true, nullsFirst: true }),
    "v_published_advisories",
  );

  const last = endDate ?? startDate;
  return rows
    .filter((row) => {
      if (!startDate || !last) return true;
      const ends = (row.ends_at as string | null)?.slice(0, 10);
      const starts = (row.starts_at as string | null)?.slice(0, 10);
      return (!ends || ends >= startDate) && (!starts || starts <= last);
    })
    .map((row) => ({
      id: row.id as string,
      title: text(row.title_i18n, locale),
      body: text(row.body_i18n, locale),
      severity: (row.severity as Advisory["severity"] | null) ?? "info",
      updatedAt: (row.published_at as string | null) ?? null,
      startsAt: (row.starts_at as string | null) ?? null,
      endsAt: (row.ends_at as string | null) ?? null,
      sourceName:
        Object.values((row.trust ?? {}) as TrustMap).find((entry) => entry?.source_name)
          ?.source_name ?? null,
    }));
}

// ── Ops preview (OPS-PREVIEW-01, PRD-OPS-CNT-001) ────────────────────────────────

const PREVIEW_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ACCESSIBILITY_COLUMNS =
  "step_free, wheelchair_access, queue_assistance, rest_seating, distance_from_dropoff_m, notes_i18n";

/**
 * Whether the signed-in user may preview: an Ops role, asked of the database.
 *
 * RLS already gives nobody else a base-table row. Asking first means the 404 a traveler
 * gets does not depend on that result happening to be empty.
 */
async function canPreview(id: string): Promise<boolean> {
  if (!PREVIEW_ID.test(id)) return false;
  const supabase = await webSupabase();
  const { data } = await supabase.rpc("is_ops");
  return data === true;
}

/** Guidance on a previewed entity, drafts included: the preview shows what has been written. */
async function previewGuidance(
  table: "places" | "experiences",
  id: string,
  locale: string,
): Promise<GuidanceBlock[]> {
  const supabase = await webSupabase();

  const data = mustList(
    await supabase
      .from("guidance_blocks")
      .select("id, guidance_type, body_i18n")
      .eq("applies_to_table", table)
      .eq("applies_to_id", id)
      .is("deleted_at", null)
      .order("sort_order"),
    "guidance_blocks",
  );

  return data.map((row) => ({
    id: row.id as string,
    guidanceType: row.guidance_type as string,
    body: text(row.body_i18n, locale),
  }));
}

/**
 * A place as its detail page will show it, read from the base table for an Ops preview.
 *
 * Runs as the signed-in user, never the service role, so it can read no more than that
 * operator can in Ops. `visibleToTravelers` is whether the published view returns the place —
 * the publish gate's own answer, not a copy of its rules.
 */
export async function getPlacePreview(
  id: string,
  locale: string,
): Promise<{ place: PlaceDetail; visibleToTravelers: boolean } | null> {
  if (!(await canPreview(id))) return null;
  const supabase = await webSupabase();

  const data = mustMaybe(
    await supabase
      .from("places")
      .select(
        "id, slug, name_i18n, place_type, facility_subtype, summary_i18n, address, opening_schedule, closure_rules_i18n, entry_requirements_i18n, dress_code_i18n, hours_note_i18n, visit_duration_min_minutes, visit_duration_likely_minutes, visit_duration_max_minutes, destination_id, latitude, longitude",
      )
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    "places",
  );
  if (!data) return null;

  const [destination, trust, accessibility, published, guidance] = await Promise.all([
    supabase.from("destinations").select("slug").eq("id", data.destination_id).maybeSingle(),
    supabase.rpc("entity_trust", { p_entity_table: "places", p_entity_id: id }),
    supabase
      .from("accessibility_records")
      .select(ACCESSIBILITY_COLUMNS)
      .eq("place_id", id)
      .maybeSingle(),
    supabase.from("v_published_places").select("id").eq("id", id).maybeSingle(),
    previewGuidance("places", id, locale),
  ]);

  const card = toPlaceCard(
    {
      ...data,
      trust: trust.data ?? {},
      accessibility: mustMaybe(accessibility, "accessibility_records"),
    },
    locale,
  );

  return {
    place: {
      ...card,
      destinationSlug: mustMaybe(destination, "destinations")?.slug ?? "",
      address: data.address ?? null,
      openingSchedule: (data.opening_schedule as OpeningSchedule | null) ?? null,
      closureRules: text(data.closure_rules_i18n, locale),
      entryRequirements: text(data.entry_requirements_i18n, locale),
      dressCode: text(data.dress_code_i18n, locale),
      hoursNote: text(data.hours_note_i18n, locale),
      visitDurationMinMinutes: data.visit_duration_min_minutes ?? null,
      visitDurationMaxMinutes: data.visit_duration_max_minutes ?? null,
      guidance,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      ...collectSources([card]),
    },
    visibleToTravelers: Boolean(mustMaybe(published, "v_published_places")),
  };
}

/** An experience as its detail page will show it, read from the base tables for an Ops preview. */
export async function getExperiencePreview(
  id: string,
  locale: string,
): Promise<{ experience: ExperienceDetail; visibleToTravelers: boolean } | null> {
  if (!(await canPreview(id))) return null;
  const supabase = await webSupabase();

  const data = mustMaybe(
    await supabase
      .from("experiences")
      .select(
        "id, slug, name_i18n, experience_type, significance_i18n, description_i18n, duration_min_minutes, duration_likely_minutes, duration_max_minutes, advance_booking_required, advance_booking_how_i18n, advance_booking_opens_days_before, eligibility_i18n, cost_note_i18n, queue_expectation_i18n, preparation_i18n, is_outdoor, editorial_weight, destination_id, place_id",
      )
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    "experiences",
  );
  if (!data) return null;

  const [destination, trust, rulesResult, placeResult, accessibilityResult, published, guidance] =
    await Promise.all([
      supabase.from("destinations").select("slug").eq("id", data.destination_id).maybeSingle(),
      supabase.rpc("entity_trust", { p_entity_table: "experiences", p_entity_id: id }),
      supabase
        .from("availability_rules")
        .select("id, experience_id, kind, daily_times")
        .eq("experience_id", id)
        .order("priority", { ascending: false }),
      data.place_id
        ? supabase
            .from("places")
            .select("slug, name_i18n")
            .eq("id", data.place_id)
            .is("deleted_at", null)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      data.place_id
        ? supabase
            .from("accessibility_records")
            .select(ACCESSIBILITY_COLUMNS)
            .eq("place_id", data.place_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase.from("v_published_experiences").select("id").eq("id", id).maybeSingle(),
      previewGuidance("experiences", id, locale),
    ]);

  const rules = mustList(rulesResult, "availability_rules");
  // Availability's trust is on the rule, not the experience (PRD F1), as on the real page.
  const firstRule = rules[0];
  const ruleTrust = firstRule
    ? (((
        await supabase.rpc("entity_trust", {
          p_entity_table: "availability_rules",
          p_entity_id: firstRule.id,
        })
      ).data ?? {}) as TrustMap)
    : {};
  const place = mustMaybe(placeResult, "places");
  const windows = groupAvailability(rules).get(id) ?? [];
  const card = toExperienceCard(
    {
      ...data,
      trust: trust.data ?? {},
      accessibility: mustMaybe(accessibilityResult, "accessibility_records"),
    },
    locale,
    windows,
  );

  return {
    experience: {
      ...card,
      destinationSlug: mustMaybe(destination, "destinations")?.slug ?? "",
      description: text(data.description_i18n, locale),
      eligibility: text(data.eligibility_i18n, locale),
      costNote: text(data.cost_note_i18n, locale),
      queueExpectation: text(data.queue_expectation_i18n, locale),
      preparation: text(data.preparation_i18n, locale),
      advanceBookingHow: text(data.advance_booking_how_i18n, locale),
      isOutdoor: Boolean(data.is_outdoor),
      durationMinMinutes: data.duration_min_minutes ?? null,
      durationMaxMinutes: data.duration_max_minutes ?? null,
      placeName: place ? text(place.name_i18n, locale) : null,
      placeSlug: (place?.slug as string | null | undefined) ?? null,
      guidance,
      availabilityTrust: ruleTrust["entity"],
      ...collectSources([card, { trust: ruleTrust }]),
    },
    visibleToTravelers: Boolean(mustMaybe(published, "v_published_experiences")),
  };
}
