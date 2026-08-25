"use client";

import { Button } from "@mandhira/ui";
import { createBrowserSupabase } from "@mandhira/db/client/browser";
import { useState } from "react";

type Status = { kind: "idle" | "sending" | "sent" } | { kind: "problem"; message: string };

/**
 * Traveler sign-in (AUTH-01, D-009).
 *
 * Magic link, and no password field — passwords are not an auth method for Mandhira, and
 * offering one would imply otherwise.
 *
 * The one substantive difference from the Ops form: `shouldCreateUser` is TRUE here. An
 * Ops account is created by an admin; a traveler arriving to keep a journey they have just
 * built should not meet a wall telling them to sign up first.
 *
 * Copy follows PRD §12.7 — no "error"/"failed", and each state says what to do next.
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
        shouldCreateUser: true,
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

  if (status.kind === "sent") {
    return (
      <div
        role="status"
        className="flex flex-col gap-2 rounded-lg border border-border bg-bg-surface p-4"
      >
        <h2 className="text-h3">Check your email</h2>
        <p className="text-body-sm text-text-secondary">
          We&apos;ve sent a link to {email}. Opening it on this device signs you in.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={sendMagicLink} className="flex flex-col gap-3">
      <label htmlFor="email" className="text-caption font-medium text-text-secondary">
        Your email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="min-h-11 rounded-lg border border-border bg-bg-surface px-3 text-body"
      />

      <Button type="submit" fullWidth disabled={status.kind === "sending"}>
        {status.kind === "sending" ? "Sending…" : "Email me a link"}
      </Button>

      {status.kind === "problem" ? (
        <p role="alert" className="text-body-sm text-status-broken">
          {status.message}
        </p>
      ) : null}
    </form>
  );
}
