import { z } from "zod";
import type { GeocodeResult, GeocodingProvider } from "./types";

/**
 * Nominatim (OpenStreetMap) adapter.
 *
 * Nominatim's usage policy requires a maximum of 1 request per second and a genuine
 * identifying User-Agent (INTEGRATIONS). Both are enforced here rather than left to
 * callers: a shared serialising gate means concurrent Ops searches queue instead of
 * bursting, which is the behaviour the policy actually asks for.
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const MIN_INTERVAL_MS = 1_100;

const nominatimResult = z.object({
  display_name: z.string(),
  lat: z.string(),
  lon: z.string(),
  type: z.string().optional(),
});

/** Serialises calls process-wide and spaces them by at least the policy interval. */
let gate: Promise<void> = Promise.resolve();

function nextSlot(): Promise<void> {
  const wait = gate.then(
    () => new Promise<void>((resolve) => setTimeout(resolve, MIN_INTERVAL_MS)),
  );
  // Keep the chain alive even if a caller's request rejects, or the gate would jam.
  gate = wait.catch(() => undefined);
  return wait;
}

export function createNominatimGeocoder(options: {
  /** Real contact address — the policy requires identifying the application. */
  userAgent: string;
  fetchImpl?: typeof fetch;
}): GeocodingProvider {
  const doFetch = options.fetchImpl ?? fetch;

  return {
    name: "nominatim",

    async search(query, searchOptions) {
      const trimmed = query.trim();
      if (trimmed.length < 3) return [];

      const url = new URL(NOMINATIM_URL);
      url.searchParams.set("q", trimmed);
      url.searchParams.set("format", "json");
      url.searchParams.set("limit", String(searchOptions?.limit ?? 5));
      url.searchParams.set("addressdetails", "0");
      if (searchOptions?.countryCodes?.length) {
        url.searchParams.set("countrycodes", searchOptions.countryCodes.join(","));
      }

      await nextSlot();

      const response = await doFetch(url, {
        headers: { "User-Agent": options.userAgent, Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(`Nominatim responded ${response.status}`);
      }

      const parsed = z.array(nominatimResult).safeParse(await response.json());
      if (!parsed.success) return [];

      return parsed.data.flatMap<GeocodeResult>((row) => {
        const latitude = Number(row.lat);
        const longitude = Number(row.lon);
        // Drop anything unparseable rather than surfacing NaN coordinates into a form.
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
        return [
          { label: row.display_name, latitude, longitude, ...(row.type ? { kind: row.type } : {}) },
        ];
      });
    },
  };
}
