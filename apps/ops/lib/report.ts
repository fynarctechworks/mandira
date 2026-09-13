import { reportError, type ErrorReport } from "@mandhira/db/reporting";
// The errors entry point alone: the package root also exports Node-only providers, and this
// module is bundled wherever `withApi` is, including runtimes without `node:` modules.
import { getErrorTracker } from "@mandhira/providers/errors";
import { after } from "next/server";

/** Read once per server instance: the DSN does not change while it runs. */
const tracker = getErrorTracker();

/**
 * An unexpected server failure in Ops: to the console always, and to Sentry too when
 * SENTRY_DSN is set (TRD-OBSV-001). Scheduled with `after` so it does not slow the action and
 * is not cut off when the function returns.
 */
export function reportServerError(report: ErrorReport): void {
  reportError(report);
  if (!tracker) return;

  const send = () => tracker.capture(report).catch(() => undefined);
  try {
    after(send);
  } catch {
    void send();
  }
}
