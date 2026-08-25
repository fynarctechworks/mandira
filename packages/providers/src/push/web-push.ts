import webpush from "web-push";

import type { PushMessage, PushProvider, PushResult, PushSubscription } from "./types";

/**
 * The Web Push adapter (INTEGRATIONS: web-push over VAPID).
 *
 * VAPID keys identify the sender to every push service. They are a keypair, generated once
 * with `pnpm push:keys` and stored in the environment — not per-user credentials, and not
 * something to rotate casually: changing them invalidates every existing subscription,
 * which silently stops notifications for everyone until each browser re-subscribes.
 */
export function createWebPushProvider(config?: {
  publicKey?: string;
  privateKey?: string;
  subject?: string;
}): PushProvider {
  const publicKey = config?.publicKey ?? process.env["VAPID_PUBLIC_KEY"];
  const privateKey = config?.privateKey ?? process.env["VAPID_PRIVATE_KEY"];
  const subject = config?.subject ?? process.env["VAPID_SUBJECT"];

  if (!publicKey || !privateKey || !subject) {
    throw new Error(
      "VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT must be set to send push. " +
        "Run `pnpm push:keys` to generate a pair.",
    );
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);

  return {
    name: "web-push",

    async send(subscription: PushSubscription, message: PushMessage): Promise<PushResult> {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: subscription.keys },
          JSON.stringify(message),
          {
            // A journey notification that arrives four hours later is not useful, and
            // several of them arriving at once is worse than none.
            TTL: 3600,
          },
        );

        return { status: "sent", subscriptionId: subscription.id };
      } catch (cause) {
        return classify(cause, subscription.id);
      }
    },
  };
}

/**
 * What the push service's answer means for this subscription.
 *
 * 404 and 410 are the browser telling us the subscription no longer exists — that is a
 * fact, not a transient fault, and retrying it forever fills the table with endpoints
 * that will never answer.
 */
function classify(cause: unknown, subscriptionId: string): PushResult {
  const statusCode = (cause as { statusCode?: number } | null)?.statusCode;

  if (statusCode === 404 || statusCode === 410) {
    return { status: "gone", subscriptionId };
  }

  // 429 and 5xx are the service asking us to come back later; 4xx is us being wrong, and
  // sending the same thing again will be wrong in the same way.
  const retryable = statusCode === undefined || statusCode === 429 || statusCode >= 500;

  return {
    status: "failed",
    subscriptionId,
    retryable,
    code: statusCode ? String(statusCode) : "network",
  };
}

/** Generates a VAPID keypair. Used by `scripts/generate-vapid-keys.mjs`, never at runtime. */
export function generateVapidKeys() {
  return webpush.generateVAPIDKeys();
}
