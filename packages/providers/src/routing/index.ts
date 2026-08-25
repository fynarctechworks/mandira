import { createHaversineRouter } from "./haversine";
import { createOpenRouteServiceRouter } from "./openrouteservice";
import type { LatLng, RoutingProvider, TravelEstimate, TravelMode } from "./types";

export type { LatLng, RoutingProvider, TravelEstimate, TravelMode } from "./types";
export { createHaversineRouter, haversineMetres } from "./haversine";
export { createOpenRouteServiceRouter } from "./openrouteservice";

/**
 * The routing chain: ask each provider in turn, take the first real answer.
 *
 * INTEGRATIONS mandates cache-first, and the cache is `travel_estimates` — read in
 * `packages/db`, not here, because this package must not know about the database. So the
 * order in practice is: cache → this chain → store the result back.
 *
 * The chain always ends in the straight-line estimate, which never declines. That
 * guarantee is the point: the engine can always schedule, and what varies is whether the
 * number is `routed` or `estimated` — never whether there is one.
 */
export function createRoutingChain(providers: RoutingProvider[]): RoutingProvider {
  return {
    name: providers.map((p) => p.name).join("→"),

    async estimate(from: LatLng, to: LatLng, mode: TravelMode): Promise<TravelEstimate | null> {
      for (const provider of providers) {
        const result = await provider.estimate(from, to, mode);
        if (result) return result;
      }
      return null;
    },
  };
}

let cached: RoutingProvider | undefined;

/**
 * The configured router: OpenRouteService when a key is present, straight-line otherwise.
 *
 * With no `OPENROUTESERVICE_API_KEY` — the state until ACCT-03 lands — ORS declines
 * immediately and every estimate comes back `estimated`. That is a working product with
 * honest, slightly pessimistic travel times, not a broken one, which is why this ships
 * before the key does.
 */
export function getRoutingProvider(): RoutingProvider {
  if (!cached) {
    cached = createRoutingChain([
      createOpenRouteServiceRouter({ apiKey: process.env["OPENROUTESERVICE_API_KEY"] }),
      createHaversineRouter(),
    ]);
  }
  return cached;
}

/** Test seam — the chain is cached, so a test that swaps adapters must clear it. */
export function resetRoutingProvider(): void {
  cached = undefined;
}
