/**
 * Error tracking over Sentry's envelope endpoint, with `fetch` and no SDK (TRD-OBSV-001, ACCT-06).
 *
 * `@sentry/nextjs` would spend the route budget (TRD-PERF-001) on instrumentation this product
 * does not use; what it needs is somewhere for an unexpected server failure to go. One POST per
 * failure does that.
 *
 * WHAT IS SENT. The error's type, a message with email addresses masked, a parsed stack, the
 * app and route, the environment and release. Never a request body, header, cookie, user id or
 * IP (PRD §10, DPDP) — the caller's `ErrorReport` does not even carry them.
 */

export type TrackedError = {
  route: string;
  app: "web" | "ops";
  error: unknown;
};

export type ErrorTracker = {
  readonly name: string;
  capture(report: TrackedError): Promise<void>;
};

type Dsn = { publicKey: string; origin: string; pathPrefix: string; projectId: string };

const MAX_FRAMES = 30;

export function parseDsn(dsn: string): Dsn | null {
  try {
    const url = new URL(dsn);
    const segments = url.pathname.split("/").filter(Boolean);
    const projectId = segments.pop();
    if (!url.username || !projectId || !/^\d+$/.test(projectId)) return null;
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;

    return {
      publicKey: url.username,
      origin: `${url.protocol}//${url.host}`,
      pathPrefix: segments.length > 0 ? `/${segments.join("/")}` : "",
      projectId,
    };
  } catch {
    return null;
  }
}

export function createSentryTracker(options: {
  dsn: string;
  environment?: string | undefined;
  release?: string | undefined;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): ErrorTracker {
  const parsed = parseDsn(options.dsn);
  if (!parsed) throw new Error("SENTRY_DSN is not a valid Sentry DSN.");

  const send = options.fetchImpl ?? fetch;
  const endpoint =
    `${parsed.origin}${parsed.pathPrefix}/api/${parsed.projectId}/envelope/` +
    `?sentry_key=${encodeURIComponent(parsed.publicKey)}&sentry_version=7&sentry_client=mandhira%2F1`;

  return {
    name: "sentry",

    async capture({ route, app, error }) {
      const eventId = randomHex(32);
      const cause = error instanceof Error ? error : new Error(String(error));
      const event = {
        event_id: eventId,
        timestamp: Date.now() / 1000,
        platform: "node",
        level: "error",
        logger: app,
        ...(options.environment ? { environment: options.environment } : {}),
        ...(options.release ? { release: options.release } : {}),
        tags: { app, route },
        exception: {
          values: [
            {
              type: cause.name || "Error",
              value: maskPersonalData(cause.message),
              ...(cause.stack ? { stacktrace: { frames: framesOf(cause.stack) } } : {}),
            },
          ],
        },
      };

      const body = [
        JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() }),
        JSON.stringify({ type: "event" }),
        JSON.stringify(event),
      ].join("\n");

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 2000);
      try {
        await send(endpoint, {
          method: "POST",
          headers: { "content-type": "application/x-sentry-envelope" },
          body,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** The configured tracker, or null when no DSN is set — reporting then stays console-only. */
export function getErrorTracker(
  env: Record<string, string | undefined> = process.env,
): ErrorTracker | null {
  const dsn = env["SENTRY_DSN"];
  if (!dsn || !parseDsn(dsn)) return null;
  return createSentryTracker({
    dsn,
    environment: env["VERCEL_ENV"] ?? env["NODE_ENV"],
    release: env["VERCEL_GIT_COMMIT_SHA"],
  });
}

/** An error message can quote whatever was being processed; an email address is the usual leak. */
export function maskPersonalData(message: string): string {
  return message.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]");
}

/** V8 stack lines → Sentry frames, oldest call first as Sentry expects. */
export function framesOf(stack: string) {
  const frames = stack
    .split("\n")
    .slice(1)
    .map((line) => {
      const match = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/.exec(line);
      if (!match) return null;
      return {
        function: match[1] ?? "<anonymous>",
        filename: match[2]!,
        lineno: Number(match[3]),
        colno: Number(match[4]),
        in_app: !match[2]!.includes("node_modules"),
      };
    })
    .filter((frame): frame is NonNullable<typeof frame> => frame !== null)
    .slice(0, MAX_FRAMES);

  return frames.reverse();
}

function randomHex(length: number): string {
  const bytes = new Uint8Array(length / 2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
