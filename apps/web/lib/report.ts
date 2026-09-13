import { reportError, type ErrorReport } from "@mandhira/db/reporting";
// The errors entry point alone: the package root also exports Node-only providers, and this
// module is bundled wherever `withApi` is, including runtimes without `node:` modules.
import { getErrorTracker } from "@mandhira/providers/errors";
import { after } from "next/server";

/** Read once per server instance: the DSN does not change while it runs. */
const tracker = getErrorTracker();

/**
 * An unexpected server failure: to the console always (Vercel keeps it as a log line), and to
 * Sentry too when SENTRY_DSN is set (TRD-OBSV-001, ACCT-06).
 *
 * The send is scheduled with `after`, so it neither slows the response nor is cut off when the
 * serverless function returns. Outside a request (a test, a script) it is simply fired.
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
