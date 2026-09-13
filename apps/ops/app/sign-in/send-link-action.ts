"use server";

import { createHash } from "node:crypto";

import { createServiceRoleSupabase } from "@mandhira/db/client/server";
import { rateLimit } from "@mandhira/db/rate-limit";
import { headers } from "next/headers";
import { z } from "zod";
import { opsSupabase } from "@/lib/supabase";

export type SendLinkResult =
  { ok: true } | { ok: false; code: "invalid" | "rate_limited" | "failed" };

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  next: z.string().max(500),
});

/**
 * Send an operator a sign-in link (AUTH-05, TRD §6.2 `auth_magic_link`, TRD-SEC-001).
 *
 * Limited per address on the server, keyed on a hash. Ops accounts are created by an admin,
 * so no account is ever created here — and an address with no account gets exactly the answer
 * a real one does, so this form cannot be used to find out who works on the team.
 */
export async function sendSignInLink(input: {
  email: string;
  next: string;
}): Promise<SendLinkResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };
  const { email, next } = parsed.data;

  const limit = await rateLimit(
    createServiceRoleSupabase(),
    "auth_magic_link",
    `ops-email:${createHash("sha256").update(email).digest("hex")}`,
  );
  if (!limit.allowed) return { ok: false, code: "rate_limited" };

  const supabase = await opsSupabase();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(safeNext(next))}`,
      shouldCreateUser: false,
    },
  });

  if (!error) return { ok: true };
  if (error.status === 429) return { ok: false, code: "rate_limited" };
  // No such operator. Answered like a sent link, deliberately (see above).
  if (error.status === 422 || error.status === 400 || /signups? not allowed/i.test(error.message)) {
    return { ok: true };
  }
  return { ok: false, code: "failed" };
}

/** This request's origin. Supabase Auth only honours allowlisted redirect URLs. */
async function origin(): Promise<string> {
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host") ?? "localhost";
  const proto = list.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function safeNext(next: string): string {
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}
