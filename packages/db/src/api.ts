import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { z } from "zod";

import type { Database } from "../types";
import { rateLimit, type RateLimitScope } from "./rate-limit";

/**
 * `withApi` — the route-handler pipeline every API route goes through
 * (BACKEND_ARCHITECTURE, TRD-API-001).
 *
 * Validate → authenticate → authorize → rate-limit → handle → envelope. No handler skips
 * it, which is the point: each of those steps is easy to remember four times and easy to
 * forget the fifth, and the one that gets forgotten is the one that matters.
 *
 * RLS remains the primary control underneath all of it (0008). If every check here were
 * wrong, the database would still refuse the write — this layer exists to turn a refusal
 * into an answer a person can act on, not to be the thing that refuses.
 *
 * It lives in `@mandhira/db` rather than in a package of its own because everything it
 * composes already does (D-071): the Supabase clients, `rateLimit`, `getOpsRoles`, and the
 * Zod schemas. It is exported from the `/api` subpath so nothing that reaches a browser
 * bundle can import it by accident.
 */

export type ApiErrorCode =
  | "invalid"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "failed";

export type ApiResponse<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: ApiErrorCode;
        message: string;
        fieldErrors?: Record<string, string[]>;
      };
    };

const STATUS: Record<ApiErrorCode, number> = {
  invalid: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  failed: 500,
};

/**
 * Copy per PRD §12.7: no "error", no "failed", no "URGENT". A traveler reading this is
 * usually mid-journey and already having a worse day than the server is.
 */
const MESSAGES: Record<ApiErrorCode, string> = {
  invalid: "Some details need a second look.",
  unauthenticated: "Please sign in again to continue.",
  forbidden: "This account can't do that.",
  not_found: "We couldn't find that.",
  conflict: "Something with that identifier already exists.",
  rate_limited: "Please try again in a few minutes.",
  failed: "That didn't go through. Please try again.",
};

/**
 * Thrown by a handler to refuse in its own words.
 *
 * Without it every refusal flattens to one apology, which destroys exactly the information
 * the traveler needed — "that seva is fully booked" and "we couldn't reach the server" are
 * the same sentence otherwise, and only one of them is worth retrying.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly fieldErrors: Record<string, string[]> | undefined;

  constructor(code: ApiErrorCode, message?: string, fieldErrors?: Record<string, string[]>) {
    super(message ?? MESSAGES[code]);
    this.name = "ApiError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export type OpsRole = Database["public"]["Enums"]["ops_role_enum"];

export type ApiHandlerContext<TInput> = {
  input: TInput;
  request: Request;
  /** The request-scoped client: RLS applies as the signed-in user. */
  supabase: SupabaseClient<Database>;
  /** Null for a guest, which many traveler routes allow (PRD-ACCT-001). */
  user: User | null;
  /** Who the rate limit was counted against — a user id or an anon session id. */
  rateLimitKey: string;
};

export type WithApiConfig<TSchema extends z.ZodType, TResult> = {
  /** Every input is validated. A route with no body passes `z.void()` explicitly. */
  schema: TSchema;
  handler: (context: ApiHandlerContext<z.infer<TSchema>>) => Promise<TResult>;
  /** Omit to allow guests. `[]` is not the same thing — it would allow nobody. */
  roles?: readonly OpsRole[];
  /** Requires a signed-in user without requiring an Ops role. */
  requireAuth?: boolean;
  rateLimit?: RateLimitScope;
};

export type WithApiDeps = {
  /** Request-scoped, so RLS applies as the caller. */
  createClient: () => Promise<SupabaseClient<Database>> | SupabaseClient<Database>;
  /** Service-role, for the rate-limit RPC, which no client role may execute. */
  createServiceClient: () => SupabaseClient<Database>;
  getRoles: (supabase: SupabaseClient<Database>) => Promise<OpsRole[]>;
  /**
   * Identifies a guest for rate-limiting. Supplied by the app because the cookie name and
   * the guest-session mechanism belong to it, not to this package.
   */
  anonKey?: (request: Request) => string;
  /** Reported to Sentry once B-024 wires it; until then this is where that hook goes. */
  onUnexpected?: (error: unknown, context: { route: string }) => void;
};

/**
 * Build the wrapper once per app, with that app's clients bound in.
 *
 * Dependencies are injected rather than imported so this file never reaches for
 * `next/headers` — which would make it unusable from a test, an Edge Function, or a plain
 * Node script, all of which need the same pipeline.
 */
export function createWithApi(deps: WithApiDeps) {
  return function withApi<TSchema extends z.ZodType, TResult>(
    config: WithApiConfig<TSchema, TResult>,
  ) {
    return async (request: Request): Promise<Response> => {
      try {
        const input = await validate(config.schema, request);
        const supabase = await deps.createClient();

        const {
          data: { user },
        } = await supabase.auth.getUser();

        // A route that names roles implies a signed-in user; saying both would be a rule
        // that could be set inconsistently.
        if ((config.requireAuth || config.roles) && !user) {
          throw new ApiError("unauthenticated");
        }

        if (config.roles) {
          const held = await deps.getRoles(supabase);
          if (!held.some((role) => config.roles!.includes(role))) {
            // Deliberately does not name the roles required: someone who lacks access
            // learns that they lack it, not the shape of the permission model.
            throw new ApiError("forbidden");
          }
        }

        const rateLimitKey = user?.id ?? deps.anonKey?.(request) ?? "anonymous";

        if (config.rateLimit) {
          const result = await rateLimit(
            deps.createServiceClient(),
            config.rateLimit,
            rateLimitKey,
          );

          if (!result.allowed) {
            return json(
              { ok: false, error: { code: "rate_limited", message: MESSAGES.rate_limited } },
              429,
              // TRD §6.2: a 429 without Retry-After tells the caller to guess, and every
              // client guesses wrong in the same direction.
              { "retry-after": String(result.retryAfterSeconds) },
            );
          }
        }

        const data = await config.handler({
          input,
          request,
          supabase,
          user,
          rateLimitKey,
        });

        return json({ ok: true, data }, 200);
      } catch (cause) {
        return toResponse(cause, request, deps.onUnexpected);
      }
    };
  };
}

async function validate<TSchema extends z.ZodType>(
  schema: TSchema,
  request: Request,
): Promise<z.infer<TSchema>> {
  const raw = await readInput(request);
  const parsed = schema.safeParse(raw);

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_form";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    throw new ApiError("invalid", MESSAGES.invalid, fieldErrors);
  }

  return parsed.data;
}

/**
 * The request's input, whichever way it arrived.
 *
 * Query parameters for GET and DELETE, a JSON body otherwise. One schema per route either
 * way, so a route that changes method does not also have to change how it validates.
 */
async function readInput(request: Request): Promise<unknown> {
  if (request.method === "GET" || request.method === "DELETE") {
    return Object.fromEntries(new URL(request.url).searchParams);
  }

  const body = await request.text();
  if (body.length === 0) return undefined;

  try {
    return JSON.parse(body);
  } catch {
    throw new ApiError("invalid");
  }
}

function toResponse(
  cause: unknown,
  request: Request,
  onUnexpected: WithApiDeps["onUnexpected"],
): Response {
  if (cause instanceof ApiError) {
    return json(
      {
        ok: false,
        error: {
          code: cause.code,
          message: cause.message,
          ...(cause.fieldErrors ? { fieldErrors: cause.fieldErrors } : {}),
        },
      },
      STATUS[cause.code],
    );
  }

  // Postgres unique violation — almost always a duplicate identifier in this app.
  const pgCode = (cause as { code?: string } | null)?.code;
  if (pgCode === "23505") {
    return json({ ok: false, error: { code: "conflict", message: MESSAGES.conflict } }, 409);
  }

  // Anything unrecognised is a bug, not a refusal. It is reported and then flattened: a
  // driver message or a stack trace on the wire is an information leak, and TRD-API-001
  // says so explicitly.
  onUnexpected?.(cause, { route: new URL(request.url).pathname });
  return json({ ok: false, error: { code: "failed", message: MESSAGES.failed } }, 500);
}

function json(body: ApiResponse<unknown>, status: number, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      // API responses are never cached at the edge: every one of them is scoped to a
      // session, and a shared cache is how one traveler ends up reading another's journey.
      "cache-control": "no-store",
      ...headers,
    },
  });
}
