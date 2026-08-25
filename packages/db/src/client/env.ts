/**
 * Supabase connection settings, read once and validated.
 *
 * Names are verbatim from TRD §8.4. Reading them through this module rather than
 * `process.env` at each call site means a missing variable fails immediately with a
 * useful message, instead of surfacing later as an opaque "Invalid API key".
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env.local and fill it in — ` +
        `run \`supabase status\` for local values.`,
    );
  }
  return value;
}

/** Safe to expose to the browser: the anon key is powerless without RLS passing. */
export function publicSupabaseConfig() {
  return {
    url: required("NEXT_PUBLIC_SUPABASE_URL", process.env["NEXT_PUBLIC_SUPABASE_URL"]),
    anonKey: required(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    ),
  };
}

/**
 * Server-only. The service role bypasses RLS entirely (TRD §6.1), so this must never be
 * imported into a client component — the throw below is a backstop, not the control.
 */
export function serviceRoleKey(): string {
  if (typeof window !== "undefined") {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY must never be read in the browser.");
  }
  return required("SUPABASE_SERVICE_ROLE_KEY", process.env["SUPABASE_SERVICE_ROLE_KEY"]);
}
