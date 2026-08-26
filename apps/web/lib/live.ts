import {
  getNowNextLater,
  type LiveCard,
  type LiveProjection,
  type PriorityTier,
} from "@mandhira/journey-engine";

import { getJourney, toEngineJourney } from "./journeys";
import { getKnowledgeBundle } from "./knowledge";
import type { webSupabase } from "./supabase";

/**
 * The Live Journey screen's data (PRD F8, LIVE-01..04).
 *
 * `getNowNextLater` does the thinking; this turns its answer into things a screen can
 * render — names, coordinates, a place to navigate to. The split matters: the engine has
 * no clock and no database (D-005), which is what lets the same projection be computed on
 * a server, in a worker, and on a phone in airplane mode and agree every time.
 */
type Client = Awaited<ReturnType<typeof webSupabase>>;

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
  /** Whether the traveler has already marked this one done. */
  isDone: boolean;
};

export type LiveView = {
  journeyId: string;
  journeyTitle: string;
  /** The engine's own projection, passed through so the client can re-derive countdowns. */
  projection: LiveProjection;
  now: LiveItemView;
  next: LiveItemView | null;
  later: (LiveItemView & { tier: PriorityTier })[];
  /** PRD F8's end-of-day card: tomorrow's first item, when there is a tomorrow. */
  tomorrowFirst: LiveItemView | null;
  /** Causes behind the day's health state, already turned into sentences. */
  dayCauses: string[];
  /** Whether the journey has been started (PRD-LIVE-001). */
  isActive: boolean;
};

/**
 * Build the Live view for one journey at one instant.
 *
 * `nowAt` is passed in rather than read here, for the same reason the engine takes it: a
 * function that reads the clock cannot be tested against 5:59am on a day the darshan
 * closes at 6.
 */
export async function getLiveView(
  supabase: Client,
  journeyId: string,
  locale: string,
  nowAt: string,
): Promise<LiveView | null> {
  const detail = await getJourney(supabase, journeyId, locale);
  if (!detail) return null;

  const { journey, items, health, labels } = detail;

  const knowledge = journey.destinationId
    ? await getKnowledgeBundle(journey.destinationId, locale)
    : EMPTY_KNOWLEDGE;

  const projection = getNowNextLater({
    journey: toEngineJourney(journey),
    items,
    knowledge,
    nowAt,
  });

  const places = await placesFor(supabase, items, locale);
  const byId = new Map(items.map((item) => [item.id, item]));

  /** One engine card turned into something renderable. */
  const view = (card: LiveCard | null): LiveItemView | null => {
    if (!card) return null;
    const item = card.itemId ? byId.get(card.itemId) : undefined;

    return {
      itemId: card.itemId,
      label: labelFor(card, item?.experience_id ?? null, labels),
      place: card.placeId ? (places.get(card.placeId) ?? null) : null,
      startAt: card.startAt,
      endAt: card.endAt,
      tier: item?.tier ?? null,
      isDone: item?.status === "done",
    };
  };

  const nowView = view(projection.now)!;

  /*
   * Tomorrow's first item, for the end-of-day card. Read from the plan rather than from a
   * second projection: at 10pm the traveler wants to know what time to be up, and running
   * the whole live projection against a day that has not started answers a question
   * nobody asked.
   */
  const tomorrow = items
    .filter((item) => item.day_index === projection.dayIndex + 1)
    .sort((a, b) => a.sort_order - b.sort_order)[0];

  return {
    journeyId: journey.id,
    journeyTitle: journey.title ?? "Your journey",
    projection,
    now: nowView,
    next: view(projection.next),
    later: projection.later.map((row) => {
      const item = byId.get(row.itemId);
      return {
        itemId: row.itemId,
        label: labelFor(null, item?.experience_id ?? null, labels),
        place: item?.place_id ? (places.get(item.place_id) ?? null) : null,
        startAt: row.startAt,
        endAt: row.endAt,
        tier: row.tier,
        isDone: item?.status === "done",
      };
    }),
    tomorrowFirst: tomorrow
      ? {
          itemId: tomorrow.id,
          label: labelFor(null, tomorrow.experience_id ?? null, labels),
          place: tomorrow.place_id ? (places.get(tomorrow.place_id) ?? null) : null,
          startAt: tomorrow.planned_start_at ?? null,
          endAt: tomorrow.planned_end_at ?? null,
          tier: tomorrow.tier,
          isDone: tomorrow.status === "done",
        }
      : null,
    dayCauses: [
      ...new Set(
        (health.days.find((d) => d.dayIndex === projection.dayIndex)?.causes ?? [])
          .map(causeSentence)
          .filter(Boolean),
      ),
    ],
    isActive: journey.status === "active",
  };
}

/**
 * What the card is called.
 *
 * A travel leg and a free block are named for what they ARE, not for the item they lead
 * to — "Walk to Hill Temple" is a different instruction from "Hill Temple", and a traveler
 * glancing at their phone mid-walk needs the first one.
 */
function labelFor(
  card: LiveCard | null,
  experienceId: string | null,
  labels: Map<string, string>,
): string {
  const named = experienceId ? labels.get(experienceId) : undefined;

  if (card?.kind === "travel") return named ? `On your way to ${named}` : "On your way";
  if (card?.kind === "free") return "Nothing you need to do right now";
  if (card?.kind === "before_day") return "Your day hasn't started yet";
  if (card?.kind === "day_complete") return "Today is complete";

  return named ?? "Something you added";
}

/** Names and pins for whatever the day points at, through the published views only. */
async function placesFor(
  supabase: Client,
  items: { place_id?: string | null }[],
  locale: string,
): Promise<Map<string, LivePlace>> {
  const ids = [...new Set(items.map((i) => i.place_id).filter((id): id is string => !!id))];
  const places = new Map<string, LivePlace>();
  if (ids.length === 0) return places;

  const { data } = await supabase
    .from("v_published_places")
    .select("id, name_i18n, latitude, longitude")
    .in("id", ids);

  for (const row of data ?? []) {
    if (!row.id) continue;
    const names = (row.name_i18n ?? {}) as Record<string, string>;
    places.set(row.id, {
      name: names[locale] ?? names["en"] ?? "",
      latitude: (row.latitude as number | null) ?? null,
      longitude: (row.longitude as number | null) ?? null,
    });
  }

  return places;
}

/**
 * Health causes as sentences.
 *
 * Beside the reader rather than in the engine, exactly like the builder's — the engine
 * states which check failed, never how to say it.
 */
function causeSentence(cause: { key: string; params?: Record<string, string | number> }): string {
  const minutes = String(cause.params?.["minutes"] ?? "");

  return (
    {
      "health.cause.overlap": "Two things overlap.",
      "health.cause.tight_transition": `Only ${minutes} minutes to get between two of these.`,
      "health.cause.outside_window": "One of these falls outside when it's open.",
      "health.cause.return_at_risk": `You'd reach your return about ${minutes} minutes late.`,
      "health.cause.physical_load": "This day asks a lot on foot.",
      "health.cause.no_break": "There's a long stretch here without a proper break.",
      "health.cause.not_step_free": "Part of this day is only partly step-free.",
    }[cause.key] ?? ""
  );
}

const EMPTY_KNOWLEDGE = {
  places: [],
  experiences: [],
  availability_rules: [],
  routes: [],
  transport_connections: [],
  travel_estimates: [],
  trust: {},
};
