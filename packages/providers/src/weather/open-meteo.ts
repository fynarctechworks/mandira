import { z } from "zod";
import type { WeatherCondition, WeatherProvider, WeatherReading } from "./types";

/**
 * Open-Meteo adapter (INTEGRATIONS).
 *
 * Chosen partly because it needs no API key, which means weather works from the first
 * deploy rather than waiting on an account — the same reason the straight-line router
 * ships before OpenRouteService (D-105).
 *
 * Returns null on any failure. PRD F10 forbids showing illustrative data in a live slot,
 * so there is no default sky and no "probably fine": the caller falls back to the last
 * known reading with its own timestamp, or to nothing at all.
 */
const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";

const response = z.object({
  hourly: z.object({
    time: z.array(z.string()),
    temperature_2m: z.array(z.number()),
    precipitation_probability: z.array(z.number().nullable()),
    weather_code: z.array(z.number()),
  }),
});

/**
 * WMO weather codes → the eight conditions this product actually distinguishes.
 *
 * Collapsed deliberately. Open-Meteo reports about thirty codes; a traveler deciding
 * whether to walk to a hilltop temple needs to know rain from heavy rain from a
 * thunderstorm, and nothing is served by telling them it is "slight drizzle" rather than
 * "moderate drizzle".
 */
function conditionOf(code: number, temperatureC: number): WeatherCondition {
  if (code >= 95) return "thunderstorm";
  if (code >= 71 && code <= 77) return "snow";
  // 65, 67, 82: heavy rain and violent showers.
  if (code === 65 || code === 67 || code === 82) return "heavy_rain";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if (code === 45 || code === 48) return "fog";
  // Above 40°C the temperature matters more than the sky does.
  if (temperatureC >= 40) return "hot";
  if (code >= 1 && code <= 3) return "cloudy";
  return "clear";
}

export function createOpenMeteoProvider(options?: {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): WeatherProvider {
  const doFetch = options?.fetchImpl ?? fetch;
  const timeoutMs = options?.timeoutMs ?? 5_000;

  return {
    name: "Open-Meteo",

    async forecast({ latitude, longitude, timezone, days }): Promise<WeatherReading | null> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const url = new URL(OPEN_METEO_URL);
        url.searchParams.set("latitude", String(latitude));
        url.searchParams.set("longitude", String(longitude));
        url.searchParams.set("hourly", "temperature_2m,precipitation_probability,weather_code");
        // Asked for in the destination's own zone, so an "hour" is the hour a traveler
        // will be standing in rather than one offset from UTC.
        url.searchParams.set("timezone", timezone);
        url.searchParams.set("forecast_days", String(Math.min(Math.max(days, 1), 7)));

        const result = await doFetch(url, { signal: controller.signal });
        if (!result.ok) return null;

        const parsed = response.safeParse(await result.json());
        if (!parsed.success) return null;

        const { time, temperature_2m, precipitation_probability, weather_code } =
          parsed.data.hourly;

        const hours = time.map((at, index) => {
          const temperatureC = temperature_2m[index] ?? 0;
          return {
            at,
            temperatureC,
            // A null probability means the provider did not give one — recorded as zero
            // rather than invented, since this only ever raises the bar for a trigger.
            precipitationChance: precipitation_probability[index] ?? 0,
            condition: conditionOf(weather_code[index] ?? 0, temperatureC),
          };
        });

        if (hours.length === 0) return null;

        return {
          provider: "Open-Meteo",
          /*
           * The reading is stamped NOW, at fetch time, which is the honest answer to "as
           * of when?". Open-Meteo returns a forecast rather than an observation, so there
           * is no upstream observation time to quote — and quoting the first forecast hour
           * would tell a traveler the data is fresher than it is.
           */
          observedAt: new Date().toISOString(),
          hours,
        };
      } catch {
        // Aborted, offline, malformed. All the same answer: we do not know, and PRD F10
        // says that is what to display.
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
