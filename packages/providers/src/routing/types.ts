/**
 * RoutingProvider (TRD §2.1, INTEGRATIONS, MAPS-01).
 *
 * How long it takes to get from one place to another. The engine plans around this number,
 * so what matters as much as accuracy is CONFIDENCE: a straight-line guess and a real
 * routed distance must not be indistinguishable to whatever renders them.
 *
 * Hence `source` on every result. PRD F1's rule that an unverified fact is never shown as
 * verified applies to derived numbers too — a travel time nobody routed is an estimate,
 * and a traveler deciding whether to add one more temple deserves to know which they have.
 */

/** The travel modes the schema knows (`travel_mode_enum`). */
export type TravelMode = "walk" | "car" | "bus" | "train" | "auto_rickshaw" | "ferry";

export type LatLng = { latitude: number; longitude: number };

export type TravelEstimate = {
  distanceM: number;
  durationSeconds: number;
  /**
   * Where the number came from, and therefore how much to trust it.
   *
   * - `routed` — a routing engine followed real roads.
   * - `estimated` — straight-line distance × a mode factor. Directionally right, and
   *   wrong in exactly the places that matter most: a river, a hill, a one-way system.
   */
  source: "routed" | "estimated";
  /** Adapter name, for the `travel_estimates.provider` column and for debugging. */
  provider: string;
};

export type RoutingProvider = {
  readonly name: string;
  /**
   * Returns null when this provider cannot answer — no key, quota spent, upstream down.
   *
   * Null rather than a throw, and rather than a silent fallback inside the adapter: the
   * CALLER decides what to do without an answer, and the caller is the only layer that
   * knows whether an estimate is acceptable here. An adapter that quietly substituted its
   * own guess would make `source` a lie.
   */
  estimate(from: LatLng, to: LatLng, mode: TravelMode): Promise<TravelEstimate | null>;
};
