"use client";

import { Button } from "@mandhira/ui";
import { useTranslations } from "next-intl";
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
export function SignInForm({ next, google }: { next: string; google: boolean }) {
  const t = useTranslations("signIn");
  const [email, setEmail] = useState("");
  /*
   * PRD-PRIV-004. Unticked to begin with and required to submit: a pre-ticked box is not a
   * confirmation of anything, and under DPDP a consent that was never actively given is
   * not consent. The server refuses the request without it too (0054) — this is the
   * courtesy, that is the control.
   */
  const [adult, setAdult] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault();
    setStatus({ kind: "sending" });

    const response = await fetch("/api/auth/magic-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, next, adult }),
    }).catch(() => null);
    const payload = response ? await response.json().catch(() => null) : null;

    if (!payload?.ok) {
      setStatus({
        kind: "problem",
        message: payload?.error?.code === "rate_limited" ? t("rate_limited") : t("not_sent"),
      });
      return;
    }

    setStatus({ kind: "sent" });
  }

  /*
   * PRD-ACCT-001: Google as the second way in (D-009). The same adult confirmation governs
   * it — the box sits above both buttons, and a single tick answers for either — and the
   * server checks it again, as it does for the link.
   */
  async function continueWithGoogle() {
    setStatus({ kind: "sending" });
    const response = await fetch("/api/auth/google", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ next, adult }),
    }).catch(() => null);
    const payload = response ? await response.json().catch(() => null) : null;

    if (!payload?.ok || typeof payload.data?.url !== "string") {
      setStatus({ kind: "problem", message: payload?.error?.message ?? t("google_unavailable") });
      return;
    }
    window.location.assign(payload.data.url);
  }

  if (status.kind === "sent") {
    return (
      <div
        role="status"
        className="flex flex-col gap-2 rounded-lg border border-border bg-bg-surface p-4"
      >
        <h2 className="text-h3">{t("check_email")}</h2>
        <p className="text-body-sm text-text-secondary">{t("sent", { email })}</p>
      </div>
    );
  }

  return (
    <form onSubmit={sendMagicLink} className="flex flex-col gap-3">
      <label htmlFor="email" className="text-caption font-medium text-text-secondary">
        {t("email_label")}
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

      <label htmlFor="adult" className="flex items-start gap-3 text-body-sm">
        <input
          id="adult"
          name="adult"
          type="checkbox"
          required
          checked={adult}
          onChange={(event) => setAdult(event.target.checked)}
          className="mt-0.5 size-5 shrink-0 rounded border-border accent-brand-primary"
        />
        <span className="text-text-secondary">{t("adult_confirm")}</span>
      </label>

      <Button type="submit" fullWidth disabled={status.kind === "sending" || !adult}>
        {status.kind === "sending" ? t("sending") : t("send")}
      </Button>

      {/*
        Only when the auth server has Google switched on. Without an OAuth client the
        button would send a traveler to an error page from Google, which is worse than not
        offering it — the email link works on its own (LAUNCH_KEYS row 10).
      */}
      {google ? (
        <>
          <p className="text-center text-caption text-text-secondary">{t("or")}</p>
          <Button
            type="button"
            variant="secondary"
            fullWidth
            disabled={status.kind === "sending" || !adult}
            onClick={() => void continueWithGoogle()}
          >
            {t("google")}
          </Button>
        </>
      ) : null}

      {status.kind === "problem" ? (
        <p role="alert" className="text-body-sm text-status-broken">
          {status.message}
        </p>
      ) : null}
    </form>
  );
}
