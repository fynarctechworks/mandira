import type { Enums } from "@mandhira/db";
import type { z } from "zod";
import { getOpsRoles } from "@mandhira/db/client/roles";
import { opsSupabase } from "./supabase";

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
        code: "unauthenticated" | "forbidden" | "invalid" | "conflict" | "failed";
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
      // Postgres unique violation — almost always a duplicate slug in this app.
      const code = (cause as { code?: string } | null)?.code;
      if (code === "23505") {
        return {
          ok: false,
          error: { code: "conflict", message: "Something with that identifier already exists." },
        };
      }
      // Never surface a stack trace or driver message to the client (TRD-API-001).
      console.error("[opsAction]", cause);
      return {
        ok: false,
        error: { code: "failed", message: "That didn't save. Please try again." },
      };
    }
  };
}
