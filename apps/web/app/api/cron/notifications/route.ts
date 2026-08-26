import { createServiceRoleSupabase } from "@mandhira/db/client/server";
import { createWebPushProvider, shouldDisable } from "@mandhira/providers";

import { render } from "../../../../lib/notifications";

/**
 * Sending what is due (PRD F15, TRD §5.4).
 *
 * DELIBERATELY A VERCEL CRON ROUTE, not a Supabase Edge Function — the same call as the
 * keepalive (D-072) and for a concrete reason: `web-push` is a Node library, and
 * `packages/providers` already has a tested VAPID adapter built on it. An Edge Function
 * runs Deno and would need a second implementation of the one thing here that must not be
 * subtly wrong, since a mis-signed payload fails silently at the push service.
 *
 * Runs as service-role because it sends on behalf of every traveler at once — the only
 * job in the product that legitimately reads across users. It reads exactly two tables and
 * writes only delivery outcomes.
 */
export const dynamic = "force-dynamic";

/** Kept small: a cron invocation has a time budget, and the next run is minutes away. */
const BATCH = 100;

export async function GET(request: Request): Promise<Response> {
  const secret = process.env["CRON_SECRET"];

  // No secret configured means the endpoint is closed, not open.
  if (!secret) return new Response(null, { status: 404 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response(null, { status: 401 });
  }

  const supabase = createServiceRoleSupabase();

  /*
   * VAPID keys are optional in practice — they are absent until someone runs
   * `pnpm push:keys` and sets them. The provider throws rather than half-working, which is
   * right, so the job reports that it did nothing instead of taking the deploy down. Push
   * being unavailable is a degradation; a cron endpoint that 500s every ten minutes is an
   * alert nobody can act on.
   */
  let push;
  try {
    push = createWebPushProvider();
  } catch {
    return Response.json(
      { ok: true, sent: 0, failed: 0, skipped: "push is not configured" },
      { headers: { "cache-control": "no-store" } },
    );
  }

  const { data: due } = await supabase
    .from("notifications")
    .select("id, user_id, notification_type, title_i18n, body_i18n, payload, journey_id, channel")
    .eq("status", "scheduled")
    .lte("scheduled_for", new Date().toISOString())
    .limit(BATCH);

  let sent = 0;
  let failed = 0;

  for (const row of due ?? []) {
    /*
     * An in-app notification has nowhere to be pushed to. It is "sent" the moment it is
     * due — the list is the delivery — and marking it so is what makes it appear.
     */
    if (row.channel === "inapp") {
      await markSent(supabase, row.id);
      sent += 1;
      continue;
    }

    const { data: subs } = await supabase
      .from("notification_subscriptions")
      .select("id, endpoint, keys, failure_count")
      .eq("user_id", row.user_id);

    if (!subs?.length) {
      /*
       * Nobody to push to — the traveler never granted permission, or revoked it. Recorded
       * as sent rather than failed: nothing went wrong, and a queue that accumulates
       * "failures" for people who simply never opted in is a queue nobody can read.
       */
      await markSent(supabase, row.id);
      continue;
    }

    const params =
      ((row.payload ?? {}) as { params?: Record<string, string | number> }).params ?? {};
    const message = {
      title: render((row.title_i18n as { key?: string } | null)?.key, params, "en"),
      body: render((row.body_i18n as { key?: string } | null)?.key, params, "en"),
      ...(row.journey_id ? { url: `/en/journeys/${row.journey_id}` } : {}),
      // Collapses a superseded reminder rather than stacking two leave-bys for one leg.
      tag: `${row.notification_type}:${row.journey_id ?? "none"}`,
    };

    let anySent = false;

    for (const sub of subs) {
      const result = await push.send(
        { id: sub.id, endpoint: sub.endpoint, keys: sub.keys as { p256dh: string; auth: string } },
        message,
      );

      if (result.status === "sent") {
        anySent = true;
        await supabase
          .from("notification_subscriptions")
          .update({ last_success_at: new Date().toISOString(), failure_count: 0 })
          .eq("id", sub.id);
        continue;
      }

      if (result.status === "gone") {
        // The browser threw the subscription away. Retrying it forever is how this table
        // fills with endpoints that will never answer again (see the provider's comment).
        await supabase.from("notification_subscriptions").delete().eq("id", sub.id);
        continue;
      }

      const failures = sub.failure_count + 1;

      if (shouldDisable(result, failures)) {
        await supabase.from("notification_subscriptions").delete().eq("id", sub.id);
      } else {
        await supabase
          .from("notification_subscriptions")
          .update({ failure_count: failures })
          .eq("id", sub.id);
      }
    }

    if (anySent) {
      await markSent(supabase, row.id);
      sent += 1;
    } else {
      /*
       * Every endpoint refused. Marked failed rather than retried indefinitely: a leave-by
       * reminder delivered an hour late is worse than not delivered, because the traveler
       * acts on it.
       */
      await supabase.from("notifications").update({ status: "failed" }).eq("id", row.id);
      failed += 1;
    }
  }

  return Response.json(
    { ok: true, sent, failed, at: new Date().toISOString() },
    { headers: { "cache-control": "no-store" } },
  );
}

async function markSent(
  supabase: ReturnType<typeof createServiceRoleSupabase>,
  id: string,
): Promise<void> {
  await supabase
    .from("notifications")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", id);
}
