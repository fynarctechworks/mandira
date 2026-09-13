"use client";

import { Button } from "@mandhira/ui";
import { useState } from "react";

type Status = { kind: "idle" | "sending" | "sent" } | { kind: "problem"; message: string };

/**
 * Traveler sign-in (AUTH-01, D-009).
 *
 * Magic link, and no password field — passwords are not an auth method for Mandhira, and
 * offering one would imply otherwise.
 *
 * The link is requested through `POST /api/auth/magic-link`, so TRD §6.2's limit of five an
 * hour holds per device and per address (TRD-SEC-001). An account is created on first sign-in:
 * a traveler arriving to keep a journey they have just built should not meet a sign-up wall.
 *
 * Copy follows PRD §12.7 — no "error"/"failed", and each state says what to do next.
 */
export function SignInForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault();
    setStatus({ kind: "sending" });

    const response = await fetch("/api/auth/magic-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, next }),
    }).catch(() => null);
    const payload = response ? await response.json().catch(() => null) : null;

    if (!payload?.ok) {
      setStatus({
        kind: "problem",
        message:
          payload?.error?.code === "rate_limited"
            ? "That's a few links in a short time. Please wait a little and try again."
            : "We couldn't send that link just now. Please try again in a moment.",
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
