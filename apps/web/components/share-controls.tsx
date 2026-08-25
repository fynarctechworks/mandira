"use client";

import { Button, Input, Label } from "@mandhira/ui";
import { useEffect, useState } from "react";

/**
 * Minting and revoking the share link (PRD-PREP-004).
 *
 * The link is shown in full, selectable, alongside a Copy button — a share sheet that
 * only offers "Copy" leaves anyone without clipboard permission with no way to get the
 * link at all, and this is exactly the thing a traveler wants to paste into a family
 * chat from a borrowed phone.
 *
 * Revoking says what it will do before it does it, because a link already sent to
 * someone cannot be un-sent and the traveler should know that is the trade.
 */
export function ShareControls({
  journeyId,
  locale,
  initialToken,
  expiresLabel,
}: {
  journeyId: string;
  locale: string;
  initialToken: string | null;
  /** Formatted server-side, where the locale lives. */
  expiresLabel: string | null;
}) {
  const [token, setToken] = useState<string | null>(initialToken);
  const [busy, setBusy] = useState(false);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [copied, setCopied] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  /*
   * Read AFTER mount, never during render. `window.location.origin` is empty on the
   * server, so computing the URL inline renders a relative link on the server and an
   * absolute one on the client — a hydration mismatch, and for a moment the traveler is
   * looking at a link that will not work if they copy it.
   */
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const path = `/${locale}/s/${token}`;
  const url = token ? `${origin}${path}` : null;

  async function call(method: "POST" | "DELETE") {
    setBusy(true);
    setProblem(null);

    const response = await fetch(`/api/journeys/${journeyId}/share`, { method });
    const payload = await response.json().catch(() => ({ ok: false }));

    if (!payload.ok) {
      setProblem(
        response.status === 429
          ? "That's a lot of links for one journey. Try again tomorrow."
          : "That didn't work. Please try again.",
      );
    } else {
      setToken(method === "POST" ? payload.data.token : null);
      setConfirmingRevoke(false);
    }

    setBusy(false);
  }

  if (!token) {
    return (
      <div className="flex flex-col gap-2">
        <Button onClick={() => void call("POST")} disabled={busy} variant="secondary" fullWidth>
          {busy ? "Making a link…" : "Share a read-only copy"}
        </Button>
        <p className="text-caption text-text-secondary">
          Anyone with the link can read the day-by-day plan. It never shows your travellers' details
          or your notes, and it stops working after 30 days.
        </p>
        {problem ? (
          <p role="alert" className="text-body-sm text-status-broken">
            {problem}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="share-url" className="text-body-sm font-medium">
        Anyone with this link can read your plan
      </Label>
      {/*
       * Selects itself on focus. This is a 43-character token on a phone screen, and
       * asking someone to drag-select it accurately is asking them to send half a link.
       */}
      <Input
        id="share-url"
        readOnly
        value={url ?? ""}
        onFocus={(event) => event.currentTarget.select()}
        className="min-h-11 text-body-sm"
      />

      {expiresLabel ? (
        <p className="text-caption text-text-secondary">It stops working on {expiresLabel}.</p>
      ) : null}

      <div className="flex gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            void navigator.clipboard?.writeText(url ?? "").then(
              () => setCopied(true),
              () => setProblem("Copying didn't work — you can select the link above instead."),
            );
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </Button>

        {confirmingRevoke ? (
          <Button variant="secondary" onClick={() => void call("DELETE")} disabled={busy}>
            {busy ? "Stopping…" : "Yes, stop sharing"}
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => setConfirmingRevoke(true)}>
            Stop sharing
          </Button>
        )}
      </div>

      {confirmingRevoke ? (
        <p className="text-body-sm text-text-secondary">
          The link stops working for everyone you sent it to, including people who have it open.
        </p>
      ) : null}

      {problem ? (
        <p role="alert" className="text-body-sm text-status-broken">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
