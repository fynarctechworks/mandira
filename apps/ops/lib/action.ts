import type { Enums } from "@mandhira/db";
import type { z } from "zod";
import { getOpsRoles } from "@mandhira/db/client/roles";
import { createServiceRoleSupabase } from "@mandhira/db/client/server";
import { rateLimit } from "@mandhira/db/rate-limit";
import { opsSupabase } from "./supabase";
import { reportServerError } from "@/lib/report";

/**
 * Server Action wrapper — the Ops equivalent of the `withApi` route wrapper described in
 * TRD-API-001, providing the same three guarantees for form submissions:
 *
 *   1. a session, resolved server-side (never trusted from the client)
 *   2. a role check, re-done here even though the layout already gated the page —
 *      AUTHORIZATION_MODEL requires the guard at the route level, because a Server Action
 *      is an addressable endpoint, not merely a function the page happens to call
 *   3. Zod validation of every input, with the same `{ok,data} | {ok,error}` envelope
 *
 * RLS remains the primary control underneath all of this (0008): if any of these checks
 * were wrong, the database would still refuse the write.
 */

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: "unauthenticated" | "forbidden" | "invalid" | "conflict" | "rate_limited" | "failed";
        message: string;
        /** Field-level messages, keyed by form field path, for inline display. */
        fieldErrors?: Record<string, string[]>;
      };
    };

export function opsAction<TSchema extends z.ZodType, TResult>(config: {
  roles: readonly Enums<"ops_role_enum">[];
  input: TSchema;
  handler: (args: {
    input: z.infer<TSchema>;
    supabase: Awaited<ReturnType<typeof opsSupabase>>;
    userId: string;
  }) => Promise<TResult>;
}) {
  return async (raw: unknown): Promise<ActionResult<TResult>> => {
    const supabase = await opsSupabase();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: { code: "unauthenticated", message: "Please sign in again to continue." },
      };
    }

    const held = await getOpsRoles(supabase);
    if (!held.some((role) => config.roles.includes(role))) {
      // Deliberately does not name the roles required: an operator who lacks access
      // learns that they lack it, not the shape of the permission model.
      return {
        ok: false,
        error: { code: "forbidden", message: "This account can't make that change." },
      };
    }

    // D-151. After the role check, so a refused caller spends nothing. The limiter's RPC is
    // service-role only, so one operator cannot spend another's budget.
    const limit = await rateLimit(createServiceRoleSupabase(), "ops_action", user.id);
    if (!limit.allowed) {
      return {
        ok: false,
        error: {
          code: "rate_limited",
          message: `That's a lot of changes in a short time. Try again in ${limit.retryAfterSeconds} seconds.`,
        },
      };
    }

    const parsed = config.input.safeParse(raw);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".") || "_form";
        (fieldErrors[key] ??= []).push(issue.message);
      }
      return {
        ok: false,
        error: {
          code: "invalid",
          message: "Some details need a second look.",
          fieldErrors,
        },
      };
    }

    try {
      return {
        ok: true,
        data: await config.handler({ input: parsed.data, supabase, userId: user.id }),
      };
    } catch (cause) {
      /*
       * A handler may attach `userMessage` to explain a refusal in the operator's terms —
       * "you made the last change, so it needs a different approver" rather than "that
       * didn't save". PRD F18 requires a blocked publish to say what is wrong, and
       * flattening every throw into one apology destroys exactly that information.
       */
      const userMessage = (cause as { userMessage?: string } | null)?.userMessage;
      if (typeof userMessage === "string" && userMessage.length > 0) {
        return { ok: false, error: { code: "failed", message: userMessage } };
      }

      // Postgres unique violation — almost always a duplicate slug in this app.
      const code = (cause as { code?: string } | null)?.code;
      if (code === "23505") {
        return {
          ok: false,
          error: { code: "conflict", message: "Something with that identifier already exists." },
        };
      }
      // Never surface a stack trace or driver message to the client (TRD-API-001).
      reportServerError({ route: "ops server action", error: cause, app: "ops" });
      return {
        ok: false,
        error: { code: "failed", message: "That didn't save. Please try again." },
      };
    }
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any --
 * Supabase's generated Insert/Update types widen every jsonb column to `Json`, which our
 * concrete validated shapes (OpeningSchedule, the `_i18n` records, availability payloads)
 * do not structurally satisfy even though they are correct at runtime.
 *
 * Rather than scatter a cast — and an eslint-disable that formatting can detach from the
 * line it suppresses — the widening is contained here. Every call site passes a payload
 * that `opsAction` has already validated with Zod against the same shape the database
 * enforces, so the type hole is bounded by that validation.
 */
export const asRow = (value: unknown): any => value;
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Creating knowledge is drafting (permission map: "Draft knowledge: researcher/editor").
 *
 * Several save actions both edit and create, and approvers may edit — but the insert
 * policies in 0008 do not let an approver create, so without this an approver's "Add" was
 * refused by the database with a message about nothing in particular.
 */
export async function requireDrafter(
  supabase: Awaited<ReturnType<typeof opsSupabase>>,
  what: string,
): Promise<void> {
  const held = await getOpsRoles(supabase);
  if (!held.some((role) => role === "researcher" || role === "editor" || role === "admin")) {
    throw Object.assign(new Error("refused"), {
      userMessage: `${what} is for researchers and editors. You can still edit what is already here.`,
    });
  }
}
