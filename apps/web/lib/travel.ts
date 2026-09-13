import { createServiceRoleSupabase } from "@mandhira/db/client/server";

import { mustMaybe } from "./data-error";
import type { JourneyItem, KnowledgeBundle, TravelMode } from "@mandhira/journey-engine";
import {
  getRoutingProvider,
  type RoutingProvider,
  type TravelMode as RoutedMode,
} from "@mandhira/providers";

type ServiceClient = ReturnType<typeof createServiceRoleSupabase>;

export type Leg = { from: string; to: string };

/** The schema's travel modes, as the routing adapters name them. */
const ROUTED_MODE: Record<TravelMode, RoutedMode> = {
  walk: "walk",
  vehicle: "car",
  public_transport: "bus",
  hired: "auto_rickshaw",
  other: "car",
};

/** Roads and routing data change slowly; a month-old leg is still a good leg. */
const STALE_AFTER_MS = 30 * 86_400_000;
/** Bounds one call, so a single request can never spend the day's routing quota. */
const MAX_LEGS_PER_CALL = 120;
const CONCURRENCY = 6;

/**
 * Consecutive place-to-place legs in a plan, per day, in the order the traveler will walk them.
 *
 * Only these are routed. Every ordered pair of a brief's places grows quadratically; the legs
 * a plan actually uses grow with its length.
 */
export function legsOf(items: readonly JourneyItem[]): Leg[] {
  const byDay = new Map<number, JourneyItem[]>();
  for (const item of items) {
    if (!item.place_id) continue;
    byDay.set(item.day_index, [...(byDay.get(item.day_index) ?? []), item]);
  }

  const legs = new Map<string, Leg>();
  for (const day of byDay.values()) {
    const ordered = day.sort((a, b) => a.sort_order - b.sort_order);
    for (let index = 1; index < ordered.length; index += 1) {
      const from = ordered[index - 1]!.place_id!;
      const to = ordered[index]!.place_id!;
      if (from !== to) legs.set(`${from}|${to}`, { from, to });
    }
  }
  return [...legs.values()];
}

/**
 * Fills `travel_estimates` for these legs (INTEGRATIONS: cache → routing chain → store).
 *
 * The engine takes travel time only from this cache or an authored transport connection, and
 * counts ZERO minutes when it finds neither — so without this, a journey at any real
 * destination plans as though moving between temples were instant. The chain always answers
 * (straight-line when no routing key is configured), and `provider` records whether a number
 * was `routed` or `estimated`.
 *
 * Published places only: coordinates come from `v_published_places`, so a cache row can never
 * reveal where an unpublished place is.
 */
export async function ensureTravelEstimates(
  legs: readonly Leg[],
  options: {
    modes?: readonly TravelMode[];
    client?: ServiceClient;
    router?: RoutingProvider;
    now?: Date;
  } = {},
): Promise<{ computed: number; deferred: number }> {
  if (legs.length === 0) return { computed: 0, deferred: 0 };

  const client = options.client ?? createServiceRoleSupabase();
  const router = options.router ?? getRoutingProvider();
  const modes = options.modes ?? (["vehicle", "walk"] as const);
  const now = options.now ?? new Date();

  const placeIds = [...new Set(legs.flatMap((leg) => [leg.from, leg.to]))];

  const [places, cached] = await Promise.all([
    client.from("v_published_places").select("id, latitude, longitude").in("id", placeIds),
    client
      .from("travel_estimates")
      .select("from_place_id, to_place_id, mode, computed_at")
      .in("from_place_id", placeIds)
      .in("to_place_id", placeIds),
  ]);
  if (places.error) throw places.error;
  if (cached.error) throw cached.error;

  const where = new Map<string, { latitude: number; longitude: number }>();
  for (const place of places.data ?? []) {
    if (place.id && place.latitude != null && place.longitude != null) {
      where.set(place.id, { latitude: place.latitude, longitude: place.longitude });
    }
  }

  const fresh = new Set(
    (cached.data ?? [])
      .filter((row) => now.getTime() - Date.parse(row.computed_at) < STALE_AFTER_MS)
      .map((row) => `${row.from_place_id}|${row.to_place_id}|${row.mode}`),
  );

  const wanted = legs.flatMap((leg) =>
    where.has(leg.from) && where.has(leg.to)
      ? modes
          .filter((mode) => !fresh.has(`${leg.from}|${leg.to}|${mode}`))
          .map((mode) => ({ ...leg, mode }))
      : [],
  );
  const batch = wanted.slice(0, MAX_LEGS_PER_CALL);

  const rows: {
    from_place_id: string;
    to_place_id: string;
    mode: TravelMode;
    distance_m: number;
    duration_seconds: number;
    provider: string;
    computed_at: string;
  }[] = [];

  for (let start = 0; start < batch.length; start += CONCURRENCY) {
    const answers = await Promise.all(
      batch.slice(start, start + CONCURRENCY).map(async (leg) => ({
        leg,
        estimate: await router.estimate(
          where.get(leg.from)!,
          where.get(leg.to)!,
          ROUTED_MODE[leg.mode],
        ),
      })),
    );

    for (const { leg, estimate } of answers) {
      if (!estimate) continue;
      rows.push({
        from_place_id: leg.from,
        to_place_id: leg.to,
        mode: leg.mode,
        distance_m: Math.round(estimate.distanceM),
        duration_seconds: Math.round(estimate.durationSeconds),
        provider: `${estimate.provider}:${estimate.source}`,
        computed_at: now.toISOString(),
      });
    }
  }

  if (rows.length > 0) {
    const { error } = await client
      .from("travel_estimates")
      .upsert(rows, { onConflict: "from_place_id,to_place_id,mode" });
    if (error) throw error;
  }

  return { computed: rows.length, deferred: wanted.length - batch.length };
}

export type CachedLeg = {
  distanceM: number;
  durationSeconds: number;
  /** `routed` or `estimated`, so a straight-line guess is never passed off as a road. */
  provider: string | null;
  cachedAt: string;
};

/** One cached leg, including where the number came from — which the published view omits. */
export async function readTravelEstimate(
  leg: Leg,
  mode: TravelMode,
  client: ServiceClient = createServiceRoleSupabase(),
): Promise<CachedLeg | null> {
  const row = mustMaybe(
    await client
      .from("travel_estimates")
      .select("distance_m, duration_seconds, provider, computed_at")
      .eq("from_place_id", leg.from)
      .eq("to_place_id", leg.to)
      .eq("mode", mode)
      .maybeSingle(),
    "travel_estimates",
  );

  if (!row || row.duration_seconds == null) return null;

  return {
    distanceM: row.distance_m ?? 0,
    durationSeconds: row.duration_seconds,
    provider: row.provider,
    cachedAt: row.computed_at,
  };
}

/** Planning with travel in it can reveal a new leg once travel is known; two passes settle it. */
const MAX_TRAVEL_PASSES = 2;

/**
 * Plans, routes the legs that plan walks, and plans again with real travel in it.
 *
 * A routing or cache failure never costs the traveler their plan: it is logged, and the plan
 * stands with whatever travel the cache already held.
 */
export async function planWithTravel<T extends { items: readonly JourneyItem[] }>(input: {
  load: () => Promise<KnowledgeBundle>;
  plan: (knowledge: KnowledgeBundle) => T;
  knowledge?: KnowledgeBundle;
  ensure?: typeof ensureTravelEstimates;
}): Promise<{ result: T; knowledge: KnowledgeBundle }> {
  const ensure = input.ensure ?? ensureTravelEstimates;
  let knowledge = input.knowledge ?? (await input.load());
  let result = input.plan(knowledge);

  for (let pass = 0; pass < MAX_TRAVEL_PASSES; pass += 1) {
    const travel = await ensure(legsOf(result.items)).catch((cause: unknown) => {
      console.error("[travel] estimates not refreshed", cause);
      return { computed: 0, deferred: 0 };
    });
    if (travel.computed === 0) break;

    knowledge = await input.load();
    result = input.plan(knowledge);
  }

  return { result, knowledge };
}
