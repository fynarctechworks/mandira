"use client";

import { useEffect, useState } from "react";

/**
 * The one-time note on a journey item whose critical information has gone stale
 * (PRD-TRST-004). The sentence is decided on the server; this only remembers, on this device,
 * that the traveler has seen it.
 *
 * Renders nothing until it has checked, so a note already dismissed never flashes back up
 * while the page hydrates. The key includes when the field was last confirmed, so if it is
 * confirmed again and later goes stale again, the note is shown again.
 */
export function StaleNote({
  storageKey,
  text,
  dismissLabel,
}: {
  storageKey: string;
  text: string;
  dismissLabel: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(storageKey) === "dismissed";
    } catch {
      // Storage refused (private mode): show the note; it cannot be remembered, only read.
    }
    setVisible(!dismissed);
  }, [storageKey]);

  if (!visible) return null;

  return (
    <div
      role="note"
      className="flex items-start justify-between gap-3 rounded-lg border border-border bg-bg-canvas p-3"
    >
      <p className="text-body-sm text-text-secondary">{text}</p>
      <button
        type="button"
        className="focus-ring min-h-11 shrink-0 px-2 text-body-sm font-medium underline"
        onClick={() => {
          try {
            window.localStorage.setItem(storageKey, "dismissed");
          } catch {
            // Not remembered; hidden for this visit all the same.
          }
          setVisible(false);
        }}
      >
        {dismissLabel}
      </button>
    </div>
  );
}
