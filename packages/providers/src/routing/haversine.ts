import type { LatLng, RoutingProvider, TravelEstimate, TravelMode } from "./types";

/**
 * The fallback: straight-line distance × a mode factor (INTEGRATIONS, MAPS-01).
 *
 * This is what answers when there is no routing key, when the day's quota is spent, or
 * when OpenRouteService is down — which, for a product used at 5am in hill country on a
 * patchy connection, is not an edge case.
 *
 * Every result is marked `estimated`, and that label has to survive all the way to the
 * screen. A straight line is wrong in exactly the places that matter: a river with one
 * bridge, a hill with a road around it, a temple street closed to vehicles.
 *
 * The detour factor is why this is usable at all. Real road distance between two points is
 * reliably longer than the straight line, and by a fairly consistent ratio per mode — so
 * the guess is deliberately PESSIMISTIC. A traveler who arrives early has a moment to sit
 * down; one who arrives late has missed a darshan that happens once that day.
 */

/** Mean Earth radius (metres). */
const EARTH_RADIUS_M = 6_371_000;

/**
 * Road distance ÷ straight-line distance, and typical speed in metres per second.
 *
 * Speeds are deliberately unambitious. They stand in for real conditions in Indian
 * pilgrimage towns — crowds, parking, level crossings, the last two hundred metres on
 * foot — not for an empty highway.
 */
const MODE: Record<TravelMode, { detour: number; speedMps: number }> = {
  // A pedestrian takes a fairly direct line; the limit is crowds and steps, not distance.
  walk: { detour: 1.25, speedMps: 1.1 },
  car: { detour: 1.4, speedMps: 8.3 },
  // A bus adds stops and a route chosen for other people's journeys, not yours.
  bus: { detour: 1.6, speedMps: 6.1 },
  // Rail is the straightest thing here and the least affected by traffic.
  train: { detour: 1.2, speedMps: 13.9 },
  auto_rickshaw: { detour: 1.4, speedMps: 6.9 },
  ferry: { detour: 1.05, speedMps: 5.1 },
};

/** Great-circle distance in metres. */
export function haversineMetres(from: LatLng, to: LatLng): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;

  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);

  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Never fails and never returns null — that is its job.
 *
 * It is the bottom of the chain, so if this could decline there would be nothing left to
 * ask, and the engine would have to schedule around an unknown. An honest pessimistic
 * number beats a gap.
 */
export function createHaversineRouter(): RoutingProvider {
  return {
    name: "haversine",

    estimate(from: LatLng, to: LatLng, mode: TravelMode): Promise<TravelEstimate | null> {
      const { detour, speedMps } = MODE[mode];
      const distanceM = Math.round(haversineMetres(from, to) * detour);

      return Promise.resolve({
        distanceM,
        /*
         * At least a minute, even for two points in the same courtyard. Zero would tell
         * the engine a transition is free, and nothing about walking between two temple
         * buildings with your shoes off is free.
         */
        durationSeconds: Math.max(60, Math.round(distanceM / speedMps)),
        source: "estimated",
        provider: "haversine",
      });
    },
  };
}
