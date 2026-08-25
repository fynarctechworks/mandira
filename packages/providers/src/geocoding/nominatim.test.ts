import { describe, expect, it, vi } from "vitest";
import { createNominatimGeocoder } from "./nominatim";

const ok = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

function geocoder(fetchImpl: typeof fetch) {
  return createNominatimGeocoder({ userAgent: "Mandhira/test", fetchImpl });
}

describe("Nominatim geocoder", () => {
  it("maps results to the provider shape", async () => {
    const fetchImpl = vi.fn(async () =>
      ok([
        { display_name: "Main Temple, Varanasi", lat: "25.3109", lon: "83.0107", type: "place" },
      ]),
    ) as unknown as typeof fetch;

    const results = await geocoder(fetchImpl).search("main temple");

    expect(results).toEqual([
      { label: "Main Temple, Varanasi", latitude: 25.3109, longitude: 83.0107, kind: "place" },
    ]);
  });

  it("sends an identifying User-Agent, as the usage policy requires", async () => {
    const fetchImpl = vi.fn(async () => ok([])) as unknown as typeof fetch;
    await geocoder(fetchImpl).search("varanasi");

    const [, init] = (fetchImpl as unknown as { mock: { calls: [URL, RequestInit][] } }).mock
      .calls[0]!;
    expect((init.headers as Record<string, string>)["User-Agent"]).toBe("Mandhira/test");
  });

  it("does not call the service for a query too short to be meaningful", async () => {
    const fetchImpl = vi.fn(async () => ok([])) as unknown as typeof fetch;
    const results = await geocoder(fetchImpl).search("va");

    expect(results).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("drops rows with unparseable coordinates rather than yielding NaN", async () => {
    const fetchImpl = vi.fn(async () =>
      ok([
        { display_name: "Good", lat: "25.31", lon: "83.01" },
        { display_name: "Bad", lat: "not-a-number", lon: "83.01" },
      ]),
    ) as unknown as typeof fetch;

    const results = await geocoder(fetchImpl).search("somewhere");
    expect(results).toHaveLength(1);
    expect(results[0]?.label).toBe("Good");
  });

  it("returns nothing when the payload is not the shape we expect", async () => {
    const fetchImpl = vi.fn(async () => ok({ unexpected: true })) as unknown as typeof fetch;
    await expect(geocoder(fetchImpl).search("anything")).resolves.toEqual([]);
  });

  it("surfaces an outage rather than pretending there were no matches", async () => {
    const fetchImpl = vi.fn(
      async () => ({ ok: false, status: 503 }) as unknown as Response,
    ) as unknown as typeof fetch;

    await expect(geocoder(fetchImpl).search("anything")).rejects.toThrow(/503/);
  });
});
