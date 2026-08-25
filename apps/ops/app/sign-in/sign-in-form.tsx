"use client";

import { Button } from "@mandhira/ui";
import { createBrowserSupabase } from "@mandhira/db/client/browser";
import { useState } from "react";

type Status = { kind: "idle" | "sending" | "sent" } | { kind: "problem"; message: string };

/**
 * Magic link (primary) + Google (secondary), per D-009. No password field: passwords are
 * not an auth method for Mandhira, and offering one would imply otherwise.
 *
 * Copy follows PRD §12.7 — no "error"/"failed" vocabulary, and every state says what to
 * do next rather than what went wrong internally.
 */
export function SignInForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const redirectTo =
    typeof window === "undefined"
      ? undefined
      : `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault();
    setStatus({ kind: "sending" });

    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        ...(redirectTo ? { emailRedirectTo: redirectTo } : {}),
        // Ops accounts are created by an admin, never self-served.
        shouldCreateUser: false,
      },
    });

    if (error) {
      setStatus({
        kind: "problem",
        message: "We couldn't send that link just now. Please try again in a moment.",
      });
      return;
    }
    setStatus({ kind: "sent" });
  }

  async function signInWithGoogle() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      ...(redirectTo ? { options: { redirectTo } } : {}),
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
          We sent a sign-in link to <strong className="text-text-primary">{email}</strong>. It works
          once and expires in 10 minutes.
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
