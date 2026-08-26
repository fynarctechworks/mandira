import { runDueIngestion } from "@/lib/ingestion";

/**
 * Scheduled ingestion (PRD F17, PRD-OPS-SRC-004's "within one refresh cycle").
 *
 * IN THE OPS APP, not the traveler app. The other cron routes live in `apps/web` because
 * that is where their work is (D-072, D-124), and the same reasoning puts this one here:
 * ingestion reads Ops tables, writes Ops evidence and fills an Ops queue, and no part of it
 * has anything to do with a traveler. The two apps deploy as separate Vercel projects, so
 * each carries its own `crons` entry.
 *
 * Guarded by `CRON_SECRET` exactly as the others are — and a missing secret CLOSES the
 * endpoint rather than opening it, because the failure mode of the opposite choice is a
 * public URL that makes this server fetch arbitrary registered URLs on demand.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const secret = process.env["CRON_SECRET"];

  if (!secret) return new Response(null, { status: 404 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response(null, { status: 401 });
  }

  const outcomes = await runDueIngestion();

  /*
   * Always 200, even when individual runs failed. A source that is unreachable is a fact
   * this job RECORDED (on its `ingestion_jobs` row, visible on O09); a cron endpoint that
   * 500s because somebody else's server is down is an alert nobody can act on, and it
   * teaches whoever watches it to ignore this one.
   */
  return Response.json(
    {
      ok: true,
      ran: outcomes.length,
      failed: outcomes.filter((outcome) => outcome.status === "failed").length,
      unchanged: outcomes.filter((outcome) => outcome.unchanged).length,
      candidatesOpened: outcomes.reduce((total, outcome) => total + outcome.candidatesOpened, 0),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
