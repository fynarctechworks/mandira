import { createNominatimGeocoder } from "./nominatim";
import type { GeocodingProvider } from "./types";

export type { GeocodeResult, GeocodingProvider } from "./types";
export { createNominatimGeocoder } from "./nominatim";

let cached: GeocodingProvider | undefined;

/**
 * The configured geocoder. Nominatim today; swapping adapters is an env change, not a
 * code change (TRD §2.1).
 *
 * Cached because the Nominatim adapter holds the rate-limit gate — building a new one per
 * request would defeat it entirely.
 */
export function getGeocodingProvider(): GeocodingProvider {
  if (!cached) {
    cached = createNominatimGeocoder({
      userAgent:
        process.env["GEOCODING_USER_AGENT"] ??
        "Mandhira/0.1 (ops geocoding; contact: support@mandhira.in)",
    });
  }
  return cached;
}
