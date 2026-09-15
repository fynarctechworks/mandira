import type { Json } from "@mandhira/db/types";
import { createServiceRoleSupabase } from "@mandhira/db/client/server";
import { createWebPushProvider, getEmailProvider, shouldDisable } from "@mandhira/providers";

import { deliverEmail } from "../../../../lib/email-delivery";
import { recordProviderUsage } from "../../../../lib/provider-usage";
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
 * job in the product that legitimately reads across users. It reads the queue, the push
 * subscriptions and — for email only — the traveler's own switches and address, and writes
 * only delivery outcomes.
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
   * Each channel is delivered only when it can be. VAPID keys and the email sender are both
   * optional in practice — absent until someone configures them — and the push provider
   * throws rather than half-working, which is right.
   *
   * A channel that is not configured is left out of the READ, not read and skipped. Its rows
   * stay scheduled for the day it is, and they cannot fill the batch of a hundred and starve
   * the channels that work: in-app notifications are delivered whether or not push is.
   */
  let push: ReturnType<typeof createWebPushProvider> | null;
  try {
    push = createWebPushProvider();
  } catch {
    push = null;
  }
  const email = getEmailProvider();

  const channels = [
    "inapp",
    ...(push ? ["push"] : []),
    ...(email.name === "none" ? [] : ["email"]),
  ];

  const { data: due } = await supabase
    .from("notifications")
    .select(
      "id, user_id, notification_type, title_i18n, body_i18n, payload, journey_id, channel, scheduled_for",
    )
    .eq("status", "scheduled")
    .in("channel", channels)
    .lte("scheduled_for", new Date().toISOString())
    // Oldest first, so a backlog drains in order and nothing waits behind newer rows forever.
    .order("scheduled_for", { ascending: true })
    .limit(BATCH);

  /*
   * Each traveler's own language, read at send time (PRD-LANG-001): a reminder queued while
   * they used English still arrives in Telugu if that is what they use now.
   */
  const userIds = [...new Set((due ?? []).map((row) => row.user_id))];
  const { data: profiles } =
    userIds.length > 0
      ? await supabase.from("profiles").select("id, locale").in("id", userIds)
      : { data: [] };
  const localeOf = new Map((profiles ?? []).map((profile) => [profile.id, profile.locale]));

  let sent = 0;
  let failed = 0;
  let cancelled = 0;

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

    if (row.channel === "email") {
      const outcome = await deliverEmail(row, {
        provider: email,
        locale: localeOf.get(row.user_id) ?? "en",
        prefsOf: async (userId) => {
          const { data } = await supabase
            .from("profiles")
            .select("notification_prefs, deleted_at")
            .eq("id", userId)
            .maybeSingle();
          // An account on its way out is not written to, whatever it once agreed to.
          if (!data || data.deleted_at) return null;
          return (data.notification_prefs ?? {}) as Record<string, boolean>;
        },
        addressOf: async (userId) => {
          const { data } = await supabase.auth.admin.getUserById(userId);
          return data.user?.email ?? null;
        },
      });

      // MON-01: anything but a cancellation reached the email provider.
      if (outcome !== "cancelled" && email.name === "Resend") {
        await recordProviderUsage("resend", 1);
      }

      if (outcome === "sent") {
        await markSent(supabase, row.id);
        sent += 1;
      } else if (outcome === "cancelled") {
        await supabase.from("notifications").update({ status: "cancelled" }).eq("id", row.id);
        cancelled += 1;
      } else if (outcome === "failed") {
        await supabase.from("notifications").update({ status: "failed" }).eq("id", row.id);
        failed += 1;
      } else if (outcome === "retry") {
        /*
         * Stays scheduled, but not for the very next run: an email provider that is down is
         * rarely back ten minutes later, and retrying every run would spend the batch on it.
         * 5, 10, 20, 40, then every 60 minutes, inside the 24 hours `deliverEmail` allows —
         * measured from the first due time, which is kept in the payload.
         */
        const payload = (row.payload ?? {}) as Record<string, unknown>;
        const attempts = Number(payload["email_attempts"] ?? 0) + 1;
        const waitMinutes = Math.min(60, 5 * 2 ** (attempts - 1));
        await supabase
          .from("notifications")
          .update({
            scheduled_for: new Date(Date.now() + waitMinutes * 60_000).toISOString(),
            payload: {
              ...payload,
              email_attempts: attempts,
              first_due_at: payload["first_due_at"] ?? row.scheduled_for,
            } as Json,
          })
          .eq("id", row.id);
      }
      continue;
    }

    // Push rows are only read when push is configured; this narrows the type for what follows.
    if (!push) continue;

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
    const locale = localeOf.get(row.user_id) ?? "en";
    const message = {
      title: render((row.title_i18n as { key?: string } | null)?.key, params, locale),
      body: render((row.body_i18n as { key?: string } | null)?.key, params, locale),
      ...(row.journey_id ? { url: `/${locale}/journeys/${row.journey_id}` } : {}),
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
    {
      ok: true,
      sent,
      failed,
      cancelled,
      notConfigured: [...(push ? [] : ["push"]), ...(email.name === "none" ? ["email"] : [])],
      at: new Date().toISOString(),
    },
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
