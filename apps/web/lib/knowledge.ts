import { getI18n } from "@mandhira/i18n";
import type { TrustState } from "@mandhira/ui";

import { webSupabase } from "./supabase";

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

/** The trust payload the published views attach to every entity. */
export type TrustEntry = {
  confidence: "high" | "medium" | "low";
  freshness: "fresh" | "aging" | "stale";
  verified_at: string | null;
  valid_until: string | null;
  source_name: string | null;
  source_tier_label: string | null;
  conflict_flag: boolean;
};

export type TrustMap = Record<string, TrustEntry>;

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

/**
 * PRD F9's mapping from computed confidence to a badge, restated in one place.
 *
 * A conflict or staleness forces "Check locally" regardless of confidence: a field two
 * sources disagree about is not something to reassure anyone about, whatever its tier.
 */
export function trustStateOf(entry: TrustEntry | undefined): TrustState | null {
  if (!entry) return null;
  if (entry.conflict_flag || entry.freshness === "stale") return "check_locally";
  if (entry.confidence === "high") return "verified";
  if (entry.confidence === "medium") return "verified_earlier";
  return "check_locally";
}

/**
 * The weakest badge across an entity's fields — what a CARD should show.
 *
 * A card carrying one "Verified" badge while an unshown field says "Check locally" would
 * be technically true and practically a lie. The card summarises; the detail page and the
 * trust sheet break it down.
 */
export function weakestTrustState(trust: TrustMap): TrustState | null {
  const order: TrustState[] = ["verified", "verified_earlier", "check_locally"];
  let worst: TrustState | null = null;

  for (const entry of Object.values(trust)) {
    const state = trustStateOf(entry);
    if (!state) continue;
    if (!worst || order.indexOf(state) > order.indexOf(worst)) worst = state;
  }

  return worst;
}

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
        "id, slug, name_i18n, experience_type, significance_i18n, duration_likely_minutes, advance_booking_required, advance_booking_opens_days_before, editorial_weight, trust, accessibility",
      )
      .eq("destination_id", destination.id)
      // PRD F2: ranked by the editorial weight Ops set, never by popularity.
      .order("editorial_weight", { ascending: false })
      .limit(SECTION_LIMIT),
    supabase
      .from("v_published_places")
      .select(
        "id, slug, name_i18n, place_type, facility_subtype, summary_i18n, visit_duration_likely_minutes, editorial_weight, trust, accessibility",
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
