"use client";

import { Button } from "@mandhira/ui";
import { useState } from "react";

import { sendSignInLink } from "./send-link-action";

type Status = { kind: "idle" | "sending" | "sent" } | { kind: "problem"; message: string };

/**
 * Magic link (primary) + Google (secondary), per D-009. No password field: passwords are
 * not an auth method for Mandhira, and offering one would imply otherwise.
 *
 * The link is sent by a server action, so TRD §6.2's per-address limit holds (TRD-SEC-001),
 * and the answer is the same whether or not the address belongs to an operator.
 *
 * Copy follows PRD §12.7 — no "error"/"failed" vocabulary, and every state says what to do
 * next rather than what went wrong internally.
 */
export function SignInForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault();
    setStatus({ kind: "sending" });

    const result = await sendSignInLink({ email, next }).catch(() => null);

    if (!result?.ok) {
      setStatus({
        kind: "problem",
        message:
          result && !result.ok && result.code === "rate_limited"
            ? "That's a few links in a short time. Please wait a little and try again."
            : "We couldn't send that link just now. Please try again in a moment.",
      });
      return;
    }
    setStatus({ kind: "sent" });
  }

  async function signInWithGoogle() {
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    /*
     * Imported here rather than at module scope (B-024's perf budget): `@supabase/ssr` pulls in
     * supabase-js, around 70 kB, needed only once this is actually tapped.
     */
    const { createBrowserSupabase } = await import("@mandhira/db/client/browser");
    await createBrowserSupabase().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
  }

  if (status.kind === "sent") {
    return (
      <div
        role="status"
        className="rounded-card border border-border-subtle bg-surface p-6 shadow-card"
      >
        <h2 className="text-h3">Check your email</h2>
        <p className="mt-2 text-body text-text-secondary">
          If <strong className="text-text-primary">{email}</strong> belongs to an operator, a
          sign-in link is on its way. It works once and expires in 10 minutes.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={sendMagicLink} className="flex flex-col gap-3">
        <label htmlFor="email" className="text-body-sm font-medium">
          Work email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="focus-ring min-h-12 rounded-input border border-border-subtle bg-surface px-3 text-body"
          placeholder="you@example.org"
        />
        <Button type="submit" fullWidth loading={status.kind === "sending"}>
          Email me a sign-in link
        </Button>
      </form>

      <Button variant="secondary" fullWidth onClick={signInWithGoogle}>
        Continue with Google
      </Button>

      {status.kind === "problem" ? (
        <p role="alert" className="text-body-sm text-status-tight">
          {status.message}
        </p>
      ) : null}
    </div>
  );
}
