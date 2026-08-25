import { createServiceRoleSupabase } from "@mandhira/db/client/server";

/**
 * Keepalive (TRD §5.4).
 *
 * Supabase pauses a free-tier project after a week of inactivity, and a paused project
 * takes several minutes to come back — which for a traveler standing at a gate is the
 * same as being down. One trivial query a day is enough to prevent it.
 *
 * DELIBERATELY NOT a Supabase Edge Function. `BACKEND_ARCHITECTURE` lists `keepalive`
 * among the Edge Functions while TRD §5.4 assigns it to Vercel Cron; TRD outranks the
 * architecture docs (CLAUDE.md §2), and here it is also simply right — an Edge Function
 * that pings Supabase runs ON Supabase, so a paused project cannot wake itself up. The
 * pinger has to be somewhere else. Recorded as D-072.
 *
 * Not wrapped in `withApi`: there is no user, no input to validate, and no rate limit to
 * apply. What it does need is proof the caller is Vercel Cron, which is a different check
 * entirely and is the whole of the logic below.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const secret = process.env["CRON_SECRET"];

  // No secret configured means the endpoint is closed, not open. An unauthenticated
  // endpoint that touches the database is worth more to an attacker than to us.
  if (!secret) {
    return new Response(null, { status: 404 });
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response(null, { status: 401 });
  }

  const supabase = createServiceRoleSupabase();

  // The cheapest possible read against a table that always has rows and holds nothing
  // personal. `locales` is seeded by migration and never empty.
  const { error } = await supabase.from("locales").select("code").limit(1);

  return Response.json(
    { ok: !error, at: new Date().toISOString() },
    { status: error ? 503 : 200, headers: { "cache-control": "no-store" } },
  );
}
