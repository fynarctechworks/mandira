/**
 * PushProvider (TRD §2.1, INTEGRATIONS: web-push over VAPID).
 *
 * Web Push and nothing else. There is no SMS and no marketing channel, because PRD F15
 * says notifications are journey-related or they do not exist — and a provider interface
 * with a channel nobody is allowed to use is an invitation to use it.
 */

export type PushSubscription = {
  id: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export type PushMessage = {
  title: string;
  body: string;
  /** Where tapping it should land — a path, never an absolute URL from user data. */
  url?: string;
  /** Collapses an earlier unread notification of the same tag, e.g. a superseded leave-by. */
  tag?: string;
  data?: Record<string, unknown>;
};

/**
 * What happened to one send.
 *
 * `gone` is separated from `failed` deliberately: a 404 or 410 from a push service means
 * the browser threw the subscription away, and retrying it forever is how a table fills
 * with endpoints that will never answer again.
 */
export type PushResult =
  | { status: "sent"; subscriptionId: string }
  | { status: "gone"; subscriptionId: string }
  | { status: "failed"; subscriptionId: string; retryable: boolean; code: string };

export type PushProvider = {
  readonly name: string;
  send(subscription: PushSubscription, message: PushMessage): Promise<PushResult>;
};

/** TRD §5.4: disable a subscription after five consecutive failures. */
export const MAX_PUSH_FAILURES = 5;

/**
 * Whether a subscription should be given up on.
 *
 * A subscription the push service says is gone is dropped immediately — waiting for five
 * failures to agree with an answer we already have just delays the cleanup.
 */
export function shouldDisable(result: PushResult, failureCount: number): boolean {
  if (result.status === "gone") return true;
  if (result.status === "failed") return failureCount + 1 >= MAX_PUSH_FAILURES;
  return false;
}
