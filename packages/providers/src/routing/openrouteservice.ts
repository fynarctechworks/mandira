import { z } from "zod";
import type { LatLng, RoutingProvider, TravelEstimate, TravelMode } from "./types";

/**
 * OpenRouteService adapter (INTEGRATIONS: 2,000 requests/day on the free tier).
 *
 * Returns null rather than throwing whenever it cannot answer — no key, quota spent,
 * upstream slow or down. The caller falls back to the straight-line estimate, and the
 * traveler gets a number marked `estimated` instead of a screen that will not load.
 *
 * Note what this adapter does NOT do: it does not fall back internally. If it did, a
 * `routed` label could end up on a number nobody routed, and the whole point of that
 * label is that it distinguishes the two.
 */

const ORS_BASE = "https://api.openrouteservice.org/v2/directions";

/** ORS profile names for the modes the schema knows. */
const PROFILE: Partial<Record<TravelMode, string>> = {
  walk: "foot-walking",
  car: "driving-car",
  // ORS has no bus or auto-rickshaw profile. `driving-car` follows the same road network,
  // which is closer to the truth than a straight line even though the speed differs — and
  // the duration is corrected below rather than taken at face value.
  bus: "driving-car",
  auto_rickshaw: "driving-car",
  // Deliberately absent: `train` and `ferry` run on networks ORS does not model, and a
  // road route between two stations is not an answer — it is a plausible wrong number.
  // Those fall through to `transport_connections`, which is where real timetables live.
};

/**
 * How much slower than a car, for modes borrowing the driving profile.
 *
 * A bus stops; an auto-rickshaw is nimble in traffic but slower flat out. Applied to ORS's
 * duration rather than substituting our own, so the road geometry still comes from a real
 * routing engine.
 */
const DURATION_FACTOR: Partial<Record<TravelMode, number>> = {
  bus: 1.5,
  auto_rickshaw: 1.15,
};

const orsResponse = z.object({
  routes: z
    .array(
      z.object({
        summary: z.object({
          distance: z.number(),
          duration: z.number(),
        }),
      }),
    )
    .min(1),
});

export function createOpenRouteServiceRouter(options: {
  apiKey: string | undefined;
  fetchImpl?: typeof fetch;
  /** Upstream slowness must not become the traveler's slowness. */
  timeoutMs?: number;
}): RoutingProvider {
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 4_000;

  return {
    name: "openrouteservice",

    async estimate(from: LatLng, to: LatLng, mode: TravelMode): Promise<TravelEstimate | null> {
      const profile = PROFILE[mode];

      // No key configured is the NORMAL state until ACCT-03 lands, not a failure worth
      // logging on every call.
      if (!options.apiKey || !profile) return null;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await doFetch(`${ORS_BASE}/${profile}`, {
          method: "POST",
          headers: {
            authorization: options.apiKey,
            "content-type": "application/json",
          },
          // ORS takes [longitude, latitude] — the opposite order to everything else here,
          // and a swap produces a confident answer for somewhere entirely different.
          body: JSON.stringify({
            coordinates: [
              [from.longitude, from.latitude],
              [to.longitude, to.latitude],
            ],
          }),
          signal: controller.signal,
        });

        if (!response.ok) return null;

        const parsed = orsResponse.safeParse(await response.json());
        if (!parsed.success) return null;

        const summary = parsed.data.routes[0]!.summary;

        return {
          distanceM: Math.round(summary.distance),
          durationSeconds: Math.max(
            60,
            Math.round(summary.duration * (DURATION_FACTOR[mode] ?? 1)),
          ),
          source: "routed",
          provider: "openrouteservice",
        };
      } catch {
        // Aborted, offline, malformed — all the same answer to the caller: ask someone
        // else. Swallowed rather than rethrown because there IS someone else to ask.
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
