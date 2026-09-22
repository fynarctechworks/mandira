"use client";

import { Button } from "./button";
import { BottomSheet } from "./bottom-sheet";

type TrustSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Source name plus its tier in words, e.g. "Official temple authority". */
  sourceName: string;
  sourceTierLabel: string;
  /** Already-formatted dates — formatting is locale work, not this component's job. */
  lastConfirmed: string;
  validUntil?: string;
  /** e.g. "Two sources list different evening timings. We show the official one." */
  conflictNote?: string;
  /** Shown when the value was edited after it was last confirmed (0053). */
  changedNote?: string;
  onReportChange?: () => void;
  labels?: Partial<{
    title: string;
    source: string;
    lastConfirmed: string;
    validUntil: string;
    reportChange: string;
  }>;
};

/**
 * PRD F9 trust sheet, opened from a TrustBadge. Shows source, last confirmed, validity and any
 * conflict note, plus "Report a change" (F14). Never shows a confidence percentage.
 */
export function TrustSheet({
  open,
  onOpenChange,
  sourceName,
  sourceTierLabel,
  lastConfirmed,
  validUntil,
  conflictNote,
  changedNote,
  onReportChange,
  labels,
}: TrustSheetProps) {
  const t = {
    title: "Where this comes from",
    source: "Source",
    lastConfirmed: "Last confirmed",
    validUntil: "Valid until",
    reportChange: "Report a change",
    ...labels,
  };

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t.title}>
      <dl className="flex flex-col gap-3 text-body-sm">
        <div>
          <dt className="text-text-secondary">{t.source}</dt>
          <dd className="text-text-primary">
            {sourceName} — {sourceTierLabel}
          </dd>
        </div>
        <div>
          <dt className="text-text-secondary">{t.lastConfirmed}</dt>
          <dd className="text-text-primary">{lastConfirmed}</dd>
        </div>
        {validUntil ? (
          <div>
            <dt className="text-text-secondary">{t.validUntil}</dt>
            <dd className="text-text-primary">{validUntil}</dd>
          </div>
        ) : null}
      </dl>

      {/*
       * Above the conflict note, because it qualifies the "Last confirmed" date directly
       * over it: that date is true of a value this one has since replaced.
       */}
      {changedNote ? (
        <p className="mt-4 rounded-card bg-status-warning/12 p-3 text-body-sm text-text-primary">
          {changedNote}
        </p>
      ) : null}

      {conflictNote ? (
        <p className="mt-4 rounded-card bg-status-info/12 p-3 text-body-sm text-text-primary">
          {conflictNote}
        </p>
      ) : null}

      {onReportChange ? (
        <Button variant="secondary" fullWidth className="mt-6" onClick={onReportChange}>
          {t.reportChange}
        </Button>
      ) : null}
    </BottomSheet>
  );
}

export type { TrustSheetProps };
