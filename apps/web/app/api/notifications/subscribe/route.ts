import { ApiError } from "@mandhira/db/api";
import { z } from "zod";

import { withApi } from "../../../../lib/api";

/**
 * Registering and removing a Web Push subscription (TRD §5.2, NOTF-01).
 *
 * A subscription is issued by the BROWSER's push service, so what arrives here is an
 * endpoint URL plus two keys that let us encrypt to it. It is not a credential of ours and
 * it identifies a browser, not a person — but it is still tied to a user row, so it is
 * treated as the traveler's own data: RLS-scoped, and removed the moment they say stop.
 *
 * `endpoint` is unique in the schema, so re-subscribing the same browser updates rather
 * than accumulating. A traveler who reinstalls the app twice should not get three copies
 * of every reminder.
 */
const subscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(256),
  }),
  /** Purely for diagnosing which browsers fail; never rendered, never analysed. */
  userAgent: z.string().max(256).optional(),
});

export const POST = withApi({
  schema: subscribeSchema,
  requireAuth: true,
  rateLimit: "push_subscribe",
  handler: async ({ input, supabase, user }) => {
    const { error } = await supabase.from("notification_subscriptions").upsert(
      {
        user_id: user!.id,
        endpoint: input.endpoint,
        keys: input.keys,
        user_agent: input.userAgent ?? null,
        // A re-subscribe is a fresh start: whatever went wrong with the old endpoint is
        // not this one's problem.
        failure_count: 0,
      },
      { onConflict: "endpoint" },
    );

    if (error) throw new ApiError("failed");
    return { subscribed: true };
  },
});

/**
 * Unsubscribing.
 *
 * A hard delete, like revoking a share link. "Stop sending me things" should leave nothing
 * behind that a later bug could resume from.
 */
export const DELETE = withApi({
  schema: z.object({ endpoint: z.string().url().max(2048) }),
  requireAuth: true,
  rateLimit: "push_subscribe",
  handler: async ({ input, supabase, user }) => {
    await supabase
      .from("notification_subscriptions")
      .delete()
      .eq("endpoint", input.endpoint)
      .eq("user_id", user!.id);

    return { subscribed: false };
  },
});
