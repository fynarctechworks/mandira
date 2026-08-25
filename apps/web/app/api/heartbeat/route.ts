/**
 * Connectivity heartbeat.
 *
 * Deliberately trivial and uncached: the ConnectionBanner needs to know whether anything
 * actually answers, which `navigator.onLine` cannot tell it — that reports whether a
 * network interface exists, not whether the internet is reachable.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return new Response(null, {
    status: 204,
    headers: { "cache-control": "no-store" },
  });
}
