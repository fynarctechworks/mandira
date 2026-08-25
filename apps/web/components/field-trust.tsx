"use client";

import { useState } from "react";
import { TrustBadge, TrustSheet } from "@mandhira/ui";

import type { TrustEntry } from "../lib/trust";
import { trustStateOf } from "../lib/trust";

/**
 * A trust badge that opens its sheet (PRD F9).
 *
 * The acceptance criterion is one tap from any badge, which is why this is a client
 * component and the pages around it are not — the sheet is the only thing here that needs
 * state, and pushing that boundary any further up would make the whole destination page
 * client-rendered for the sake of a bottom sheet nobody has opened yet.
 *
 * A missing trust record renders NOTHING rather than a neutral badge. PRD F1 is explicit
 * that an unverified fact is never shown; a badge saying "we have no idea" attached to a
 * timing is worse than the timing appearing without one, because it looks like a verdict.
 */
export function FieldTrust({
  entry,
  fieldLabel,
  lastConfirmed,
  validUntil,
}: {
  entry: TrustEntry | undefined;
  /** What this badge is about, e.g. "Opening hours" — read out to a screen reader. */
  fieldLabel: string;
  /** Formatted by the server component, which is where the locale lives. */
  lastConfirmed: string;
  validUntil?: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const state = trustStateOf(entry);

  if (!state || !entry) return null;

  return (
    <>
      <TrustBadge
        state={state}
        onClick={() => setOpen(true)}
        aria-label={`${fieldLabel} — where this comes from`}
      />
      <TrustSheet
        open={open}
        onOpenChange={setOpen}
        sourceName={entry.source_name ?? "Not recorded"}
        sourceTierLabel={entry.source_tier_label ?? ""}
        lastConfirmed={lastConfirmed}
        {...(validUntil ? { validUntil } : {})}
        {...(entry.conflict_flag
          ? {
              /*
               * PRD F9's own wording. A traveler is told a disagreement exists and which
               * side we chose — not reassured, and not left to find out at the gate.
               */
              conflictNote:
                "Two sources list different information for this. We show the official one.",
            }
          : {})}
      />
    </>
  );
}
