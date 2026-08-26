import { CloudRain, Thermometer } from "lucide-react";

import type { LiveCondition, WeatherHour } from "../lib/live-conditions";

/**
 * Live conditions on the Live screen (PRD F10, PRD-DYN-001/003).
 *
 * The label is not decoration. PRD F10's rule — never a live value without provider and
 * timestamp — is what separates this from the verified knowledge above it, and a traveler
 * needs to know which of the two they are reading. Verified opening hours are something
 * somebody checked; a forecast is something a machine guessed twenty minutes ago.
 *
 * A degraded feed shows its label and NO values. Showing yesterday's forecast beside
 * "unavailable" would be showing stale data as current, and a blank would invite the
 * assumption that conditions are fine.
 */
export function LiveConditions({ conditions }: { conditions: LiveCondition[] }) {
  const weather = conditions.find((condition) => condition.feedKind === "weather");
  if (!weather) return null;

  const next = weather.hours[0];

  return (
    <section aria-labelledby="conditions" className="flex flex-col gap-2">
      <h2 id="conditions" className="text-h2">
        Conditions
      </h2>

      <div className="flex flex-col gap-2 rounded-lg border border-border bg-bg-surface p-4">
        {weather.degraded ? (
          /*
           * PRD-DYN-003, word for word. Said calmly and without alarm vocabulary
           * (PRD §12.7) — a feed being down is our problem, not the traveler's.
           */
          <p className="text-body-sm text-text-secondary">{weather.label}</p>
        ) : (
          <>
            {next ? (
              <p className="flex items-center gap-2 text-body">
                <Thermometer className="size-4" aria-hidden />
                {Math.round(next.temperatureC)}°C
                {next.precipitationChance >= 30 ? (
                  <span className="flex items-center gap-1 text-text-secondary">
                    <CloudRain className="size-4" aria-hidden />
                    {next.precipitationChance}% chance of rain
                  </span>
                ) : null}
              </p>
            ) : null}

            {/* Provider and time, always. */}
            <p className="text-caption text-text-secondary">{weather.label}</p>
          </>
        )}
      </div>
    </section>
  );
}

/**
 * A warning against one item, when the weather genuinely threatens it.
 *
 * Only for outdoor items, and only for conditions that change whether being outside is a
 * good idea. A line about rain attached to a darshan inside a temple is a line travelers
 * learn to skim — and then the thunderstorm during the evening aarti gets skimmed with it.
 */
export function WeatherWarning({ hours }: { hours: WeatherHour[] }) {
  if (hours.length === 0) return null;

  const worst = hours[0]!;

  const sentence =
    worst.condition === "thunderstorm"
      ? "There's a thunderstorm forecast around this time."
      : worst.condition === "heavy_rain"
        ? "Heavy rain is forecast around this time."
        : worst.condition === "hot"
          ? `It's forecast to reach ${Math.round(worst.temperatureC)}°C around this time.`
          : "Rain is likely around this time.";

  return <p className="text-body-sm text-status-tight">{sentence} This one is outdoors.</p>;
}
