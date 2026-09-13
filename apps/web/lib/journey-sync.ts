/**
 * Watching an open journey for changes made on another device (PRD-ACCT-005: a second device
 * shows the change within 10 seconds, and the latest edit wins).
 *
 * A version check rather than a realtime subscription: two timestamps every ten seconds cost
 * almost nothing, add no client library to a page already near its budget (TRD-PERF-001),
 * and need no socket kept open on a phone in a queue. Latest-edit-wins is how every write
 * already behaves; this only makes sure the other screen finds out.
 *
 * Kept free of the DOM so the timing rules are tested once; the component supplies the fetch,
 * the refresh and what "active" means.
 */

export const SYNC_INTERVAL_MS = 10_000;

export type VersionWatcher = {
  /** Stops checking; safe to call more than once. */
  stop(): void;
  /** Checks now, e.g. when the tab becomes visible again. */
  check(): Promise<void>;
};

export function watchJourneyVersion(options: {
  initialVersion: string;
  fetchVersion: () => Promise<string | null>;
  onChange: (version: string) => void;
  /** False while the tab is hidden or offline: nothing to show, nothing to spend. */
  isActive?: () => boolean;
  intervalMs?: number;
  schedule?: (callback: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
}): VersionWatcher {
  const interval = options.intervalMs ?? SYNC_INTERVAL_MS;
  const schedule = options.schedule ?? ((callback, ms) => setTimeout(callback, ms));
  const cancel =
    options.cancel ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  let known = options.initialVersion;
  let stopped = false;
  let inFlight = false;
  let handle: unknown = null;

  async function check(): Promise<void> {
    if (stopped || inFlight) return;
    if (options.isActive && !options.isActive()) return;

    inFlight = true;
    try {
      const version = await options.fetchVersion();
      if (!stopped && version && version !== known) {
        known = version;
        options.onChange(version);
      }
    } catch {
      // Offline, rate-limited or a blip. The next tick tries again; nothing to tell anyone.
    } finally {
      inFlight = false;
    }
  }

  function next(): void {
    if (stopped) return;
    handle = schedule(() => {
      void check().finally(next);
    }, interval);
  }

  next();

  return {
    stop() {
      stopped = true;
      if (handle !== null) cancel(handle);
    },
    check,
  };
}
