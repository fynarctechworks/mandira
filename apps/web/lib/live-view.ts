import {
  computeHealth,
  getNowNextLater,
  type Cause,
  type JourneyItem,
  type KnowledgeBundle,
  type LiveCard,
  type LiveProjection,
  type PriorityTier,
  type JourneyItemDependency,
  type TravelerProfile,
} from "@mandhira/journey-engine";

import { engineText, type Translate } from "./engine-text";
import { weakestTrustEntry, type TrustEntry, type TrustMap } from "./trust";
import { toEngineJourney, type StoredItem, type StoredJourney } from "./journey-types";

/**
 * Turning a journey into the Live screen's view (PRD F8).
 *
 * PURE — no Supabase, no Dexie, no clock of its own. That is the point: the server calls
 * this with rows from Postgres and the browser calls it with rows from IndexedDB, and
 * TRD-ARCH-002 requires those two to agree. Two assemblers would drift, and the direction
 * they drift in is a traveler in airplane mode being shown a different plan from the one
 * they were shown an hour earlier with signal.
 */
export type LivePlace = {
  name: string;
  latitude: number | null;
  longitude: number | null;
};

export type LiveItemView = {
  itemId: string | null;
  label: string;
  place: LivePlace | null;
  startAt: string | null;
  endAt: string | null;
  tier: PriorityTier | null;
  isDone: boolean;
  /**
   * The weakest trust entry behind this item's timing (PRD F9 "trust on Live"): the
   * experience's, or the place's when it is a visit. Null when nothing is recorded, and then
   * no badge is shown rather than a neutral one.
   */
  trust: TrustEntry | null;
  /** What a report from Live is about: the experience, or the place for a visit. */
  entity: { table: "experiences" | "places"; id: string } | null;
};

export type LiveView = {
  journeyId: string;
  journeyTitle: string;
  /** Which destination, so live conditions can be read for it (PRD F10). */
  destinationId: string | null;
  projection: LiveProjection;
  now: LiveItemView;
  next: LiveItemView | null;
  later: (LiveItemView & { tier: PriorityTier })[];
  tomorrowFirst: LiveItemView | null;
  dayCauses: string[];
  isActive: boolean;
  /**
   * Whether `nowAt` falls on one of the journey's own dates, in its timezone. "Start today"
   * is offered only then: on the evening before, it asked the traveler to start a journey
   * that begins tomorrow.
   */
  onJourneyDates: boolean;
  /** When the data behind this view was read, or null when it came straight from the server. */
  syncedAt: string | null;
};

export function assembleLiveView(input: {
  journey: StoredJourney;
  items: StoredItem[];
  bundle: KnowledgeBundle;
  /** Experience and place ids → display names. */
  labels: Map<string, string>;
  places: Map<string, LivePlace>;
  /** Never `Date.now()` inside this function — the caller owns the clock (D-005). */
  nowAt: string;
  syncedAt?: string | null;
  /** The reader's language: the server passes its request translator, the browser its own. */
  t: Translate;
  /**
   * Who is travelling, for PRD-HLTH-005's physical load. The server has them; the offline
   * snapshot deliberately carries no traveler profiles, so there the check is not run.
   */
  travelers?: TravelerProfile[];
  dependencies?: JourneyItemDependency[];
}): LiveView {
  const { journey, items, bundle, labels, places, nowAt, t } = input;
  const engineJourney = toEngineJourney(journey);
  const people = {
    ...(input.travelers ? { travelers: input.travelers } : {}),
    ...(input.dependencies ? { dependencies: input.dependencies } : {}),
  };

  const projection = getNowNextLater({
    journey: engineJourney,
    items,
    knowledge: bundle,
    nowAt,
    ...people,
  });

  const health = computeHealth({ journey: engineJourney, items, knowledge: bundle, ...people });
  const byId = new Map(items.map((item) => [item.id, item]));
  const entityOf = (item: StoredItem | undefined): LiveItemView["entity"] =>
    item?.experience_id
      ? { table: "experiences", id: item.experience_id }
      : item?.place_id
        ? { table: "places", id: item.place_id }
        : null;
  const trustOf = (item: StoredItem | undefined): TrustEntry | null => {
    const map = (bundle.trust ?? {}) as Record<string, TrustMap>;
    const own = item?.experience_id ? map[item.experience_id] : undefined;
    const place = item?.place_id ? map[item.place_id] : undefined;
    return weakestTrustEntry(own ?? place ?? {}) ?? null;
  };

  const view = (card: LiveCard | null): LiveItemView | null => {
    if (!card) return null;
    const item = card.itemId ? byId.get(card.itemId) : undefined;

    return {
      itemId: card.itemId,
      label: labelFor(card, item?.experience_id ?? null, labels, t),
      place: card.placeId ? (places.get(card.placeId) ?? null) : null,
      startAt: card.startAt,
      endAt: card.endAt,
      tier: item?.tier ?? null,
      isDone: item?.status === "done",
      trust: trustOf(item),
      entity: entityOf(item),
    };
  };

  const rowFor = (item: StoredItem | undefined): LiveItemView | null =>
    item
      ? {
          itemId: item.id,
          label: labelFor(null, item.experience_id ?? null, labels, t),
          place: item.place_id ? (places.get(item.place_id) ?? null) : null,
          startAt: item.planned_start_at ?? null,
          endAt: item.planned_end_at ?? null,
          tier: item.tier,
          isDone: item.status === "done",
          trust: trustOf(item),
          entity: entityOf(item),
        }
      : null;

  /*
   * Tomorrow's first item, for the end-of-day card. Read from the plan rather than by
   * projecting the next day: at 10pm the traveler wants to know what time to be up, and
   * running the whole live projection against a day that has not started answers a
   * question nobody asked.
   */
  const tomorrow = items
    .filter((item) => item.day_index === projection.dayIndex + 1)
    .sort((a, b) => a.sort_order - b.sort_order)[0];

  return {
    journeyId: journey.id,
    journeyTitle: journey.title ?? t("addToJourney.untitled"),
    destinationId: journey.destinationId,
    projection,
    now: view(projection.now)!,
    next: view(projection.next),
    later: projection.later
      .map((row) => {
        const built = rowFor(byId.get(row.itemId));
        return built ? { ...built, tier: row.tier } : null;
      })
      .filter((row): row is LiveItemView & { tier: PriorityTier } => row !== null),
    tomorrowFirst: rowFor(tomorrow),
    dayCauses: [
      ...new Set(
        (health.days.find((d) => d.dayIndex === projection.dayIndex)?.causes ?? [])
          .map((cause) => causeSentence(cause, t))
          .filter(Boolean),
      ),
    ],
    isActive: journey.status === "active",
    onJourneyDates: onJourneyDates(journey, nowAt),
    syncedAt: input.syncedAt ?? null,
  };
}

/**
 * What the card is called.
 *
 * A travel leg and a free block are named for what they ARE, not for the item they lead
 * to — "On your way to Hill Temple" is a different instruction from "Hill Temple", and a
 * traveler glancing at their phone mid-walk needs the first one.
 */
function labelFor(
  card: LiveCard | null,
  experienceId: string | null,
  labels: Map<string, string>,
  t: Translate,
): string {
  const named = experienceId ? labels.get(experienceId) : undefined;

  if (card?.kind === "travel") {
    return named ? t("live.labels.travel_to", { name: named }) : t("live.labels.travel");
  }
  if (card?.kind === "free") return t("live.labels.free");
  if (card?.kind === "before_day") return t("live.labels.before_day");
  if (card?.kind === "day_complete") return t("live.labels.day_complete");

  return named ?? t("common.something_you_added");
}

/**
 * Health causes as sentences.
 *
 * Beside the reader rather than in the engine, exactly like the builder's — the engine
 * states which check failed, never how to say it.
 */
function causeSentence(cause: Cause, t: Translate): string {
  /*
   * The engine's own keys, through the one renderer every screen uses (D-158). Live kept a
   * private map of older cause names, so most of today's causes (a day that overruns, a
   * fixed commitment it cannot reach) rendered as nothing here.
   */
  return engineText(t, cause.key, cause.params);
}

/** Re-exported so consumers do not need to reach into the engine for one type. */
export type { JourneyItem };

/** The journey's local date at `nowAt` is within its start and end dates (inclusive). */
function onJourneyDates(journey: StoredJourney, nowAt: string): boolean {
  if (!journey.startDate) return false;
  // en-CA formats as YYYY-MM-DD, which compares correctly as a string.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: journey.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(nowAt));
  return today >= journey.startDate && (!journey.endDate || today <= journey.endDate);
}
