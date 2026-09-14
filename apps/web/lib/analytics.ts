import type { AnalyticsEventInput, AnalyticsEventName } from "@mandhira/db/analytics";

/**
 * The client half of privacy-safe analytics (PRD-ANLY-001, PRD F20).
 *
 * Events wait in memory and go to `/api/analytics` in one batch, a few seconds after the
 * last one or when the page is hidden. The route enforces the allowlist; typing the name
 * here only catches a misspelling before it is silently refused.
 *
 * Nothing here may break a screen. A traveler offline keeps their events queued until the
 * browser is back online, marked as having happened offline, and a batch that cannot be
 * sent is dropped rather than retried forever: a measurement is never worth a battery.
 */

const FLUSH_AFTER_MS = 5_000;
/** The route accepts 50 events per request. */
const BATCH = 50;
/** A tab left open offline for a day should not grow without bound. */
const MAX_QUEUED = 200;

type Context = Pick<AnalyticsEventInput, "journeyId" | "destinationId" | "locale">;

let queue: AnalyticsEventInput[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let listening = false;

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function track(
  name: AnalyticsEventName,
  properties: Record<string, string | number | boolean> = {},
  context: Context = {},
): void {
  if (typeof window === "undefined") return;
  listen();

  queue.push({ name, properties, ...context, isOffline: isOffline() });
  if (queue.length > MAX_QUEUED) queue = queue.slice(-MAX_QUEUED);

  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flushAnalytics(), FLUSH_AFTER_MS);
}

export async function flushAnalytics(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  if (queue.length === 0 || isOffline()) return;

  const pending = queue;
  queue = [];

  for (let i = 0; i < pending.length; i += BATCH) {
    try {
      await fetch("/api/analytics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ events: pending.slice(i, i + BATCH) }),
        // Lets the last batch leave with a closing tab.
        keepalive: true,
      });
    } catch {
      // Dropped on purpose; see above.
    }
  }
}

function listen() {
  if (listening) return;
  listening = true;

  window.addEventListener("online", () => void flushAnalytics());
  window.addEventListener("pagehide", () => void flushAnalytics());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flushAnalytics();
  });
}

/** Test seam: forget anything queued. */
export function resetAnalyticsForTests(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  queue = [];
}
