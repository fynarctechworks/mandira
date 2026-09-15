import { createServiceRoleSupabase } from "@mandhira/db/client/server";
import { getEmailProvider } from "@mandhira/providers";

import { recordProviderUsage } from "../../../../lib/provider-usage";
import { reportServerError } from "../../../../lib/report";

/**
 * The daily Ops alert (TRD §11 Monitoring and §13 cost controls; migrations 0046, 0050).
 *
 * Two things nobody sees unless they open the dashboard: a queue item waiting more than seven
 * days, and a provider past 70 % of its free quota. The database says which of each, counted
 * as the dashboard counts them, and this emails the admins one plain summary. Nothing to say,
 * nothing sent. No email provider configured, nothing sent and the run says so — the
 * dashboard still shows the same figures, so the alert is a nudge, not the only record.
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

  const [overdueResult, usageResult] = await Promise.all([
    supabase.rpc("ops_overdue_queues", { p_days: OVERDUE_DAYS }),
    supabase.rpc("provider_usage_status"),
  ]);
  const failure = overdueResult.error ?? usageResult.error;
  if (failure) {
    reportServerError({ route: "GET /api/cron/ops-alerts", error: failure, app: "web" });
    return Response.json({ ok: false }, { status: 503, headers });
  }

  const overdue = overdueResult.data ?? [];
  const nearLimit = (usageResult.data ?? []).filter((row) => row.near_limit);

  if (overdue.length === 0 && nearLimit.length === 0) {
    return Response.json({ ok: true, overdue: 0, quotas: 0, sent: 0 }, { headers });
  }

  const email = getEmailProvider();
  if (email.name === "none") {
    return Response.json(
      {
        ok: true,
        overdue: overdue.length,
        quotas: nearLimit.length,
        sent: 0,
        reason: "email_not_configured",
      },
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
  const subjects: string[] = [];
  const text: string[] = [];

  if (overdue.length > 0) {
    subjects.push(
      `${overdue.length} ${overdue.length === 1 ? "queue has" : "queues have"} work waiting over ${OVERDUE_DAYS} days`,
    );
    text.push(`Some Ops queues have work that has waited more than ${OVERDUE_DAYS} days:`, "");
    for (const queue of overdue) {
      const days = Math.floor((now - Date.parse(queue.oldest_at)) / 86_400_000);
      text.push(
        `${QUEUE_LABEL[queue.queue] ?? queue.queue}: ${queue.open_count} waiting, the oldest for ${days} days`,
      );
    }
    text.push("");
  }

  if (nearLimit.length > 0) {
    subjects.push(
      `${nearLimit.length} free ${nearLimit.length === 1 ? "quota is" : "quotas are"} at 70% or more`,
    );
    text.push("These providers have used 70% or more of their free quota:", "");
    for (const row of nearLimit) {
      text.push(
        `${row.label}: ${row.used} of ${row.quota} ${row.period === "month" ? "this month" : "today"} (${row.share}%)`,
      );
    }
    text.push("");
  }

  text.push("Open the Ops dashboard for the details.");
  const subject = `Mandhira Ops: ${subjects.join("; ")}`;

  let attempts = 0;
  let sent = 0;
  for (const recipient of recipients ?? []) {
    if (!recipient.email) continue;
    attempts += 1;
    const result = await email.send({
      to: recipient.email,
      subject,
      text: text.join("\n"),
      tag: "ops_alert",
    });
    if (result.ok) sent += 1;
  }

  // The alert spends email quota too (MON-01).
  if (email.name === "Resend") await recordProviderUsage("resend", attempts, supabase);

  return Response.json(
    { ok: true, overdue: overdue.length, quotas: nearLimit.length, sent },
    { headers },
  );
}
