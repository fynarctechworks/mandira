/**
 * WeatherProvider (TRD §2.1, INTEGRATIONS, PRD F10).
 *
 * PRD F10's rule is the shape of this interface: **never show a live value without a
 * provider and a timestamp**. So neither is optional here — a reading that cannot say
 * where it came from or when it was taken is not a reading this product will render.
 *
 * The second rule is just as load-bearing: never show illustrative or placeholder data in
 * a live slot. There is therefore no "default" or "unknown" weather. A provider that
 * cannot answer says so, and the UI shows the fallback label rather than an invented sky.
 */

export type WeatherCondition =
  "clear" | "cloudy" | "rain" | "heavy_rain" | "thunderstorm" | "fog" | "snow" | "hot";

export type WeatherHour = {
  /** ISO instant the hour starts. */
  at: string;
  temperatureC: number;
  /** 0–100. */
  precipitationChance: number;
  condition: WeatherCondition;
};

export type WeatherReading = {
  /** Named so the UI can say "Live · Open-Meteo · as of 06:40" (PRD F10). */
  provider: string;
  /** When the provider produced it, not when we asked. */
  observedAt: string;
  hours: WeatherHour[];
};

export type WeatherProvider = {
  readonly name: string;
  /**
   * Returns null when the provider cannot answer.
   *
   * Null rather than a throw, and rather than a stale value dressed as fresh: the CALLER
   * decides what to show, and PRD-DYN-003 says what that is — "Live update unavailable —
   * showing last known (as of …)", with the badge dropping to Check locally.
   */
  forecast(input: {
    latitude: number;
    longitude: number;
    /** IANA zone, so the hours line up with the traveler's day rather than with UTC. */
    timezone: string;
    days: number;
  }): Promise<WeatherReading | null>;
};

/**
 * Whether a forecast is bad enough to matter to a plan (PRD-DYN-004).
 *
 * Deliberately blunt. A trigger raised for a 20% chance of light rain is a trigger
 * travelers learn to dismiss, and then the one about a thunderstorm during an outdoor
 * evening aarti gets dismissed with it. Only conditions that genuinely change whether an
 * outdoor item is a good idea count.
 */
export function isDisruptive(hour: WeatherHour): boolean {
  if (hour.condition === "thunderstorm" || hour.condition === "heavy_rain") return true;
  if (hour.condition === "rain" && hour.precipitationChance >= 70) return true;

  // Pilgrimage routes are walked, often barefoot, often by people who are not young.
  // Above 40°C an outdoor item stops being a question of comfort.
  return hour.temperatureC >= 40;
}
