/**
 * GeocodingProvider (TRD §2.1, INTEGRATIONS).
 *
 * Ops-only and low volume: operators search for a place and confirm the pin on a map.
 * Never called from the traveler app, and never on a request path a traveler triggers.
 */

export type GeocodeResult = {
  /** Human-readable name, as returned by the provider. */
  label: string;
  latitude: number;
  longitude: number;
  /** Provider's own classification, e.g. "place"/"building" — advisory only. */
  kind?: string;
};

export type GeocodingProvider = {
  readonly name: string;
  /**
   * Free-text forward geocoding. Returns [] when nothing matches — callers must treat an
   * empty result as "no match", not as an outage.
   */
  search(
    query: string,
    options?: { limit?: number; countryCodes?: string[] },
  ): Promise<GeocodeResult[]>;
};
