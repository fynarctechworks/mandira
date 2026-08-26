"use client";

import { useFormatter } from "next-intl";

/**
 * What changed while the traveler was away, and how old what they are reading is
 * (PRD-OFFL-002, PRD-OFFL-003).
 *
 * PRD-OFFL-003 is unusually specific about what this must NOT be: never a sync error
 * dialog, and never more than one card. Someone walking between temples does not want a
 * changelog, and a stream of notifications about knowledge updates is how they learn to
 * dismiss the one that actually affects their morning.
 *
 * So: one card, naming what moved, dismissible, and nothing at all when nothing changed.
 */
export function OfflineNotice({
  syncedAt,
  changed,
  onDismiss,
}: {
  /** When the stored copy was written, or null when this came straight from the server. */
  syncedAt: string | null;
  changed: string[];
  onDismiss: () => void;
}) {
  const format = useFormatter();

  if (changed.length === 0) {
    /*
     * No changes: the only thing worth saying is how old this is, and only when it is old
     * enough to matter. A traveler reading a snapshot from four minutes ago does not need
     * telling; one reading yesterday's does.
     */
    if (!syncedAt) return null;

    const ageMinutes = (Date.now() - Date.parse(syncedAt)) / 60_000;
    if (ageMinutes < 30) return null;

    return (
      <p className="text-caption text-text-secondary">
        Showing information saved {format.relativeTime(new Date(syncedAt))}.
      </p>
    );
  }

  return (
    <section
      aria-labelledby="offline-notice"
      className="flex flex-col gap-2 rounded-card border border-border bg-bg-surface p-4"
    >
      {/*
       * PRD §12.7's voice: no "error", no "failed", no exclamation mark. Something changed
       * and here is what — stated calmly, because most of the time it will not matter and
       * occasionally it will matter a great deal.
       */}
      <h2 id="offline-notice" className="text-h3">
        Some information updated while you were offline
      </h2>

      <ul className="flex flex-col gap-1">
        {changed.map((name) => (
          <li key={name} className="text-body-sm text-text-secondary">
            {name}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onDismiss}
        className="focus-ring min-h-11 self-start px-2 text-body-sm font-medium text-brand-primary-text"
      >
        Got it
      </button>
    </section>
  );
}
