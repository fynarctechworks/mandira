import { describe, expect, it, vi } from "vitest";
import { createOpenMeteoProvider } from "./open-meteo";
import { isDisruptive } from "./types";

/**
 * The weather provider (B-031, PRD F10).
 *
 * PRD F10's two rules are what these assert: never a live value without a provider and a
 * timestamp, and never illustrative data in a live slot. The second is the one worth
 * testing hardest — a provider that invents a fallback sky is worse than one that admits
 * it does not know.
 */
const AT = { latitude: 17.386, longitude: 78.478, timezone: "Asia/Kolkata", days: 2 };

function answering(body: unknown, status = 200) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    void url;
    void init;
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  });
}

const FORECAST = {
  hourly: {
    time: ["2026-10-12T06:00", "2026-10-12T07:00", "2026-10-12T18:00"],
    temperature_2m: [24, 27, 41],
    precipitation_probability: [10, 80, null],
    // 0 clear · 61 rain · 95 thunderstorm
    weather_code: [0, 61, 95],
  },
};

describe("the Open-Meteo adapter", () => {
  it("names itself and stamps the reading", async () => {
    const reading = await createOpenMeteoProvider({ fetchImpl: answering(FORECAST) }).forecast(AT);

    // PRD F10: never a live value without both. Neither is optional in the type, and this
    // is what checks the adapter actually fills them.
    expect(reading?.provider).toBe("Open-Meteo");
    expect(reading?.observedAt).toBeTruthy();
    expect(Number.isNaN(Date.parse(reading!.observedAt))).toBe(false);
  });

  it("asks in the destination's own timezone", async () => {
    const fetchImpl = answering(FORECAST);
    await createOpenMeteoProvider({ fetchImpl }).forecast(AT);

    // An "hour" has to be the hour a traveler will be standing in, not one offset from UTC
    // — otherwise a 6am darshan is checked against midnight's weather.
    const url = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(url.searchParams.get("timezone")).toBe("Asia/Kolkata");
  });

  it("collapses WMO codes into conditions a traveler can act on", async () => {
    const reading = await createOpenMeteoProvider({ fetchImpl: answering(FORECAST) }).forecast(AT);

    expect(reading?.hours[0]?.condition).toBe("clear");
    expect(reading?.hours[1]?.condition).toBe("rain");
    expect(reading?.hours[2]?.condition).toBe("thunderstorm");
  });

  it("records a missing probability as zero rather than inventing one", async () => {
    const reading = await createOpenMeteoProvider({ fetchImpl: answering(FORECAST) }).forecast(AT);

    // Zero only ever raises the bar for a trigger, so an absent value cannot manufacture
    // a warning nobody's data supports.
    expect(reading?.hours[2]?.precipitationChance).toBe(0);
  });

  it("returns nothing when the provider is down — never a default sky", async () => {
    // PRD F10 forbids illustrative data in a live slot. "We don't know" is the answer.
    const reading = await createOpenMeteoProvider({
      fetchImpl: answering({}, 503),
    }).forecast(AT);

    expect(reading).toBeNull();
  });

  it("returns nothing when the network throws", async () => {
    const reading = await createOpenMeteoProvider({
      fetchImpl: vi.fn(() => Promise.reject(new Error("offline"))),
    }).forecast(AT);

    expect(reading).toBeNull();
  });

  it("returns nothing for a malformed answer rather than trusting its shape", async () => {
    const reading = await createOpenMeteoProvider({
      fetchImpl: answering({ hourly: { time: ["x"] } }),
    }).forecast(AT);

    expect(reading).toBeNull();
  });

  it("returns nothing for an empty forecast", async () => {
    const reading = await createOpenMeteoProvider({
      fetchImpl: answering({
        hourly: { time: [], temperature_2m: [], precipitation_probability: [], weather_code: [] },
      }),
    }).forecast(AT);

    expect(reading).toBeNull();
  });
});

describe("what counts as disruptive (PRD-DYN-004)", () => {
  const hour = (over: Partial<Parameters<typeof isDisruptive>[0]>) =>
    isDisruptive({
      at: "2026-10-12T18:00",
      temperatureC: 28,
      precipitationChance: 0,
      condition: "clear",
      ...over,
    });

  it("counts a thunderstorm and heavy rain", () => {
    expect(hour({ condition: "thunderstorm" })).toBe(true);
    expect(hour({ condition: "heavy_rain" })).toBe(true);
  });

  it("counts likely rain, and not a passing chance of it", () => {
    /*
     * The line that keeps this useful. A trigger for a 20% chance of light rain is a
     * trigger travelers learn to dismiss — and then the thunderstorm during the outdoor
     * evening aarti gets dismissed with it.
     */
    expect(hour({ condition: "rain", precipitationChance: 80 })).toBe(true);
    expect(hour({ condition: "rain", precipitationChance: 20 })).toBe(false);
  });

  it("counts serious heat", () => {
    // Pilgrimage routes are walked, often barefoot, often by people who are not young.
    expect(hour({ temperatureC: 42 })).toBe(true);
    expect(hour({ temperatureC: 33 })).toBe(false);
  });

  it("says nothing about a clear day", () => {
    expect(hour({})).toBe(false);
  });
});
