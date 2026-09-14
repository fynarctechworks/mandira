import { createServiceRoleSupabase } from "@mandhira/db/client/server";
import { getEmailProvider } from "@mandhira/providers";

import { reportServerError } from "../../../../lib/report";

/**
 * The daily Ops queue-age alert (TRD §11 Monitoring, migration 0046).
 *
 * "Email when any queue item > 7 days": the database says which queues are overdue, counted
 * as the dashboard counts them, and this emails the admins one plain summary. Nothing
 * overdue, nothing sent. No email provider configured, nothing sent and the run says so —
 * the dashboard still shows the same ages, so the alert is a nudge, not the only record.
 *
 * Dispatched once a day by pg_cron; the CRON_SECRET check matches every other cron route.
 */
export const dynamic = "force-dynamic";

const OVERDUE_DAYS = 7;

const QUEUE_LABEL: Record<string, string> = {
  review: "Review",
  verify: "Verify",
  reverify: "Re-verification",
  conflicts: "Conflicts",
  reports: "Reports",
  publish: "Approve and publish",
};

export async function GET(request: Request): Promise<Response> {
  const secret = process.env["CRON_SECRET"];

  // No secret configured means the endpoint is closed, not open.
  if (!secret) return new Response(null, { status: 404 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response(null, { status: 401 });
  }

  const supabase = createServiceRoleSupabase();
  const headers = { "cache-control": "no-store" };

  const { data: overdue, error } = await supabase.rpc("ops_overdue_queues", {
    p_days: OVERDUE_DAYS,
  });
  if (error) {
    reportServerError({ route: "GET /api/cron/ops-alerts", error, app: "web" });
    return Response.json({ ok: false }, { status: 503, headers });
  }

  if (!overdue || overdue.length === 0) {
    return Response.json({ ok: true, overdue: 0, sent: 0 }, { headers });
  }

  const email = getEmailProvider();
  if (email.name === "none") {
    return Response.json(
      { ok: true, overdue: overdue.length, sent: 0, reason: "email_not_configured" },
      { headers },
    );
  }

  const { data: recipients, error: recipientsError } = await supabase.rpc("ops_alert_recipients");
  if (recipientsError) {
    reportServerError({
      route: "GET /api/cron/ops-alerts recipients",
      error: recipientsError,
      app: "web",
    });
    return Response.json({ ok: false }, { status: 503, headers });
  }

  const now = Date.now();
  const lines = overdue.map((queue) => {
    const days = Math.floor((now - Date.parse(queue.oldest_at)) / 86_400_000);
    return `${QUEUE_LABEL[queue.queue] ?? queue.queue}: ${queue.open_count} waiting, the oldest for ${days} days`;
  });
  const subject = `Mandhira Ops: ${overdue.length} ${
    overdue.length === 1 ? "queue has" : "queues have"
  } work waiting over ${OVERDUE_DAYS} days`;
  const text = [
    `Some Ops queues have work that has waited more than ${OVERDUE_DAYS} days:`,
    "",
    ...lines,
    "",
    "Open the Ops dashboard to pick them up.",
  ].join("\n");

  let sent = 0;
  for (const recipient of recipients ?? []) {
    if (!recipient.email) continue;
    const result = await email.send({ to: recipient.email, subject, text, tag: "ops_queue_age" });
    if (result.ok) sent += 1;
  }

  return Response.json({ ok: true, overdue: overdue.length, sent }, { headers });
}
