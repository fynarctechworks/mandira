import { createServiceRoleSupabase } from "@mandhira/db/client/server";
import type { Json } from "@mandhira/db/types";
import { getWeatherProvider, isDisruptive } from "@mandhira/providers";

/**
 * Polling the live feeds (PRD F10, PRD-DYN-002/003/005, TRD §5.4).
 *
 * Reads every enabled feed config, fetches, and records a reading — including when the
 * fetch FAILED. That is not bookkeeping: PRD-DYN-003 requires the UI to say "Live update
 * unavailable — showing last known (as of …)" within 60 seconds, and it can only say that
 * if the failure is written down. A poll that quietly skips a broken feed leaves the last
 * good reading looking current indefinitely, which is the exact opposite of the promise.
 *
 * Runs as service-role because it polls on behalf of every destination at once. It reads
 * two tables and writes one.
 */
export const dynamic = "force-dynamic";

/** How far ahead a forecast is worth fetching — the longest journey this plans for. */
const FORECAST_DAYS = 7;

export async function GET(request: Request): Promise<Response> {
  const secret = process.env["CRON_SECRET"];

  if (!secret) return new Response(null, { status: 404 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response(null, { status: 401 });
  }

  const supabase = createServiceRoleSupabase();

  const { data: configs } = await supabase
    .from("live_feed_configs")
    .select("id, destination_id, feed_kind, provider, refresh_minutes")
    .eq("is_enabled", true);

  let polled = 0;
  let unavailable = 0;
  /*
   * A write that fails is COUNTED and reported, not swallowed. Until 0025 every one of
   * them failed — `service_role` held no grant on any table — and because the result was
   * discarded this job reported success on every run while writing nothing at all.
   */
  const writeFailures: string[] = [];

  for (const config of configs ?? []) {
    /*
     * Only weather so far. A transport feed needs a provider for the launch destination,
     * and nobody has said which one exists there (OPEN-002) — so rather than invent an
     * adapter for an API that may not be the right one, other kinds are skipped and say
     * so. PRD F10 forbids placeholder data in a live slot, and an adapter written against
     * a guessed API is placeholder data with extra steps.
     */
    if (config.feed_kind !== "weather") continue;

    const centre = await centreOf(supabase, config.destination_id);

    if (!centre) {
      // No coordinates: nothing to ask about. Recorded so the gap is visible in Ops
      // rather than presenting as a feed that never updates.
      if (!(await record(supabase, config.id, "unavailable", { reason: "no_destination_centre" }, writeFailures))) {
        continue;
      }
      unavailable += 1;
      continue;
    }

    const reading = await getWeatherProvider().forecast({
      latitude: centre.latitude,
      longitude: centre.longitude,
      timezone: "Asia/Kolkata",
      days: FORECAST_DAYS,
    });

    if (!reading) {
      if (!(await record(supabase, config.id, "unavailable", { reason: "provider_unavailable" }, writeFailures))) {
        continue;
      }
      unavailable += 1;
      continue;
    }

    /*
     * Which hours a plan would actually care about (PRD-DYN-004). Stored alongside the
     * reading so the trigger check is a read rather than a re-derivation — and so an
     * operator can see WHY a trigger fired days later.
     */
    const disruptive = reading.hours.filter(isDisruptive).map((hour) => ({
      at: hour.at,
      condition: hour.condition,
      temperatureC: hour.temperatureC,
      precipitationChance: hour.precipitationChance,
    }));

    const wrote = await record(
      supabase,
      config.id,
      "ok",
      { provider: reading.provider, observedAt: reading.observedAt, hours: reading.hours, disruptive },
      writeFailures,
    );

    if (wrote) polled += 1;
  }

  /*
   * `ok: false` when nothing could be written. A cron that always answers 200 is a cron
   * whose failures are invisible, which is exactly how this went unnoticed — and Vercel
   * records a non-2xx, so somebody finds out.
   */
  const broken = writeFailures.length > 0 && polled === 0 && unavailable === 0;

  return Response.json(
    {
      ok: !broken,
      polled,
      unavailable,
      ...(writeFailures.length > 0 ? { writeFailures: writeFailures.slice(0, 5) } : {}),
      at: new Date().toISOString(),
    },
    { status: broken ? 500 : 200, headers: { "cache-control": "no-store" } },
  );
}

/** A destination's centre as plain numbers — PostGIS geography is WKB hex over the wire. */
async function centreOf(
  supabase: ReturnType<typeof createServiceRoleSupabase>,
  destinationId: string,
): Promise<{ latitude: number; longitude: number } | null> {
  const { data } = await supabase
    .from("v_published_places")
    .select("latitude, longitude")
    .eq("destination_id", destinationId)
    .not("latitude", "is", null)
    .limit(1)
    .maybeSingle();

  if (data?.latitude == null || data.longitude == null) return null;
  return { latitude: data.latitude as number, longitude: data.longitude as number };
}

/** Writes one reading. Returns whether it landed — see the note on `writeFailures`. */
async function record(
  supabase: ReturnType<typeof createServiceRoleSupabase>,
  feedConfigId: string,
  status: "ok" | "stale" | "unavailable",
  payload: Record<string, unknown>,
  failures: string[],
): Promise<boolean> {
  const { error } = await supabase.from("live_feed_readings").insert({
    feed_config_id: feedConfigId,
    status,
    payload: payload as unknown as Json,
  });

  if (error) {
    // Collected rather than thrown: one unwritable feed must not stop the others from
    // being polled. The caller reports the failures and fails the run if none landed.
    failures.push(`${feedConfigId}: ${error.message}`);
    return false;
  }

  return true;
}
