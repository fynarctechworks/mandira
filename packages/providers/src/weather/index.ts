import { createOpenMeteoProvider } from "./open-meteo";
import type { WeatherProvider } from "./types";

export type { WeatherCondition, WeatherHour, WeatherProvider, WeatherReading } from "./types";
export { isDisruptive } from "./types";
export { createOpenMeteoProvider } from "./open-meteo";

let cached: WeatherProvider | undefined;

/**
 * The configured weather provider.
 *
 * Open-Meteo, and it needs no key — so weather works from the first deploy rather than
 * waiting on an account (the same reasoning as the straight-line router, D-105). Swapping
 * adapters stays an env change rather than a code change if a destination ever needs a
 * local service with better mountain resolution.
 */
export function getWeatherProvider(): WeatherProvider {
  if (!cached) cached = createOpenMeteoProvider();
  return cached;
}

/** Test seam — the provider is cached, so a test swapping adapters must clear it. */
export function resetWeatherProvider(): void {
  cached = undefined;
}
