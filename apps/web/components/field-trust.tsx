"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { TrustBadge, TrustSheet } from "@mandhira/ui";

import type { TrustEntry } from "../lib/trust";
import { ReportAChange } from "./report-a-change";
import { track } from "../lib/analytics";
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
  report,
}: {
  entry: TrustEntry | undefined;
  /** What this badge is about, e.g. "Opening hours" — read out to a screen reader. */
  fieldLabel: string;
  /** Formatted by the server component, which is where the locale lives. */
  lastConfirmed: string;
  validUntil?: string | undefined;
  /**
   * What a report from this sheet is about. When given, the sheet offers "Report a change"
   * (PRD F9 → F14) and the report is filed against this field.
   */
  report?: {
    entityTable: "places" | "experiences" | "routes" | "destinations";
    entityId: string;
    entityName: string;
    fieldName?: string;
    locale: string;
  };
}) {
  const t = useTranslations("fieldTrust");
  const tCommon = useTranslations("common");
  const tBadge = useTranslations("trustBadge");
  const tSheet = useTranslations("trustSheet");
  const [reportOpen, setReportOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const state = trustStateOf(entry);

  if (!state || !entry) return null;

  return (
    <>
      <TrustBadge
        state={state}
        label={tBadge(state)}
        onClick={() => {
          setOpen(true);
          track("trust_sheet_opened", { trust_state: state });
        }}
        aria-label={t("badge_label", { field: fieldLabel })}
      />
      <TrustSheet
        open={open}
        onOpenChange={setOpen}
        labels={{
          title: tSheet("title"),
          source: tSheet("source"),
          lastConfirmed: tSheet("lastConfirmed"),
          validUntil: tSheet("validUntil"),
          reportChange: tSheet("reportChange"),
        }}
        {...(report
          ? {
              onReportChange: () => {
                setOpen(false);
                setReportOpen(true);
              },
            }
          : {})}
        sourceName={entry.source_name ?? tCommon("not_recorded")}
        sourceTierLabel={entry.source_tier_label ?? ""}
        lastConfirmed={lastConfirmed}
        {...(validUntil ? { validUntil } : {})}
        {...(entry.needs_reverification ? { changedNote: t("changed") } : {})}
        {...(entry.conflict_flag
          ? {
              /*
               * PRD F9's own wording. A traveler is told a disagreement exists and which
               * side we chose — not reassured, and not left to find out at the gate.
               */
              conflictNote: t("conflict"),
            }
          : {})}
      />
      {report ? (
        <ReportAChange
          {...report}
          open={reportOpen}
          onOpenChange={setReportOpen}
          showTrigger={false}
        />
      ) : null}
    </>
  );
}
