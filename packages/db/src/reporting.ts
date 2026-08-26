/**
 * Where an unexpected failure goes (PLAT-06, TRD §11.2 Day 19).
 *
 * A SEAM rather than Sentry itself, and that is a deliberate call worth reading before
 * changing. `@sentry/nextjs` is a heavy dependency, this milestone's own budget is ≤180 kB
 * of route JS (TRD-PERF-001), and there is no DSN yet — it is founder-owned (ACCT-06). So
 * installing it today would spend the budget on something inert.
 *
 * What both apps actually need is somewhere for a failure to GO, wired into every route
 * once. That ships now; swapping in Sentry later is writing one adapter, not threading a
 * new call through thirty handlers.
 *
 * WHAT IS NEVER REPORTED. Not the request body, not headers, not cookies, not a user id.
 * An error report is a debugging aid, and a debugging aid that carries a traveler's journey
 * off to a third party is a privacy incident with good intentions (PRD §10, DPDP).
 */

export type ErrorReport = {
  /** Which route, e.g. "POST /api/journeys". Never the URL with its parameters. */
  route: string;
  error: unknown;
  /** App name, so one dashboard can hold both. */
  app: "web" | "ops";
};

export type ErrorReporter = (report: ErrorReport) => void;

/**
 * The default: structured to the console, which Vercel collects as a log line.
 *
 * Deliberately not silent in production. Until a DSN exists this is the only record that a
 * route failed, and losing it would mean the first anyone hears of a problem is a traveler
 * saying the app did not work.
 */
export const consoleReporter: ErrorReporter = ({ route, error, app }) => {
  const cause = error instanceof Error ? error : new Error(String(error));

  console.error(
    JSON.stringify({
      level: "error",
      app,
      route,
      message: cause.message,
      // The stack, not the error object: an error object can carry arbitrary attached
      // properties, and one of them will eventually be a request payload.
      stack: cause.stack?.split("\n").slice(0, 12).join("\n"),
      at: new Date().toISOString(),
    }),
  );
};

let reporter: ErrorReporter = consoleReporter;

/** Swap the transport — this is where a Sentry adapter is installed when ACCT-06 lands. */
export function setErrorReporter(next: ErrorReporter): void {
  reporter = next;
}

export function reportError(report: ErrorReport): void {
  try {
    reporter(report);
  } catch {
    /*
     * Reporting must never be able to break the thing it is reporting on. A transport that
     * throws — a network hiccup, a misconfigured DSN — would otherwise turn one failed
     * request into a failed request plus an unhandled rejection.
     */
  }
}
