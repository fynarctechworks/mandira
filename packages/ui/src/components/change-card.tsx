"use client";

import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { BottomSheet } from "./bottom-sheet";
import { Button } from "./button";
import { HealthPill, type HealthState } from "./health-pill";

/** One item's before/after times inside an option (PRD F6: "Each option lists affected items"). */
export type ChangeCardAffectedItem = {
  title: string;
  /** Formatted times; omit `after` when the item is removed. */
  before: string;
  after?: string;
  /** Localised note shown instead of an after-time, e.g. "Removed". */
  outcome?: string;
};

export type ChangeCardOption = {
  id: string;
  label: string;
  /** One-sentence reason. Required — PRD Principle: every recommendation ships a reason. */
  because: string;
  affectedItems?: ChangeCardAffectedItem[];
  /** Health state if this option is taken. */
  resultingHealth?: HealthState;
  /** PRD F6 (d): moving a PROTECTED item must be highlighted and confirmed. */
  requiresConfirmation?: boolean;
};

type ChangeCardProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "You're about 30 minutes behind." */
  whatChanged: string;
  /** "Evening aarti at [place] starts at 6:30 PM and can't move." */
  whyItMatters: string;
  /** The single ranked recommendation. */
  recommended: ChangeCardOption;
  /** Up to 2 alternatives (PRD F6 caps total options at 3). */
  otherOptions?: ChangeCardOption[];
  /** Always present. Shows the health state that results from changing nothing. */
  keepAsIs: { label?: string; resultingHealth?: HealthState; because?: string };
  /** Nothing is applied until the user taps — this is the only apply path. */
  onChooseOption: (optionId: string) => void;
  onKeepAsIs: () => void;
  /** Trust badge of the new information when the trigger was a knowledge/live-data change. */
  trustBadge?: ReactNode;
  /** Shown when the new information's confidence is low (PRD F6 rules). */
  lowConfidenceNote?: string;
  labels?: Partial<{
    title: string;
    whatChanged: string;
    whyItMatters: string;
    recommended: string;
    otherOptions: string;
    keepAsIs: string;
    resultingHealth: string;
  }>;
};

function OptionBlock({
  option,
  recommended = false,
  onChoose,
  resultingHealthLabel,
}: {
  option: ChangeCardOption;
  recommended?: boolean;
  onChoose: () => void;
  resultingHealthLabel: string;
}) {
  return (
    <div
      className={cn(
        "rounded-card border p-3",
        recommended
          ? "border-brand-primary bg-brand-primary-soft"
          : "border-border-subtle bg-surface",
      )}
    >
      <p className="text-body font-medium text-text-primary">{option.label}</p>
      <p className="mt-1 text-body-sm text-text-secondary">{option.because}</p>

      {option.affectedItems && option.affectedItems.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1">
          {option.affectedItems.map((item) => (
            <li key={item.title} className="text-caption text-text-secondary">
              {item.title}: {item.before}
              {item.after ? ` → ${item.after}` : item.outcome ? ` — ${item.outcome}` : null}
            </li>
          ))}
        </ul>
      ) : null}

      {option.resultingHealth ? (
        <p className="mt-2 flex items-center gap-2 text-caption text-text-secondary">
          {resultingHealthLabel}
          <HealthPill state={option.resultingHealth} />
        </p>
      ) : null}

      <Button
        variant={recommended ? "primary" : "secondary"}
        fullWidth
        className="mt-3"
        onClick={onChoose}
      >
        {option.label}
      </Button>
    </div>
  );
}

/**
 * PRD F6 Change Card — the only UI for replanning, and the only path that applies a change.
 * Sections render in the fixed PRD order: What changed / Why it matters / Recommended /
 * Other options / Keep my plan as is. "Keep as is" is always present.
 */
export function ChangeCard({
  open,
  onOpenChange,
  whatChanged,
  whyItMatters,
  recommended,
  otherOptions = [],
  keepAsIs,
  onChooseOption,
  onKeepAsIs,
  trustBadge,
  lowConfidenceNote,
  labels,
}: ChangeCardProps) {
  const t = {
    title: "Something changed",
    whatChanged: "What changed",
    whyItMatters: "Why it matters",
    recommended: "Recommended",
    otherOptions: "Other options",
    keepAsIs: "Keep my plan as is",
    resultingHealth: "If you choose this:",
    ...labels,
  };

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t.title}>
      <div className="flex flex-col gap-5">
        <section>
          <h3 className="text-body-sm font-medium text-text-secondary">{t.whatChanged}</h3>
          <p className="mt-1 text-body text-text-primary">{whatChanged}</p>
          {trustBadge ? <div className="mt-2">{trustBadge}</div> : null}
          {lowConfidenceNote ? (
            <p className="mt-2 text-body-sm text-status-tight">{lowConfidenceNote}</p>
          ) : null}
        </section>

        <section>
          <h3 className="text-body-sm font-medium text-text-secondary">{t.whyItMatters}</h3>
          <p className="mt-1 text-body text-text-primary">{whyItMatters}</p>
        </section>

        <section>
          <h3 className="text-body-sm font-medium text-text-secondary">{t.recommended}</h3>
          <div className="mt-2">
            <OptionBlock
              option={recommended}
              recommended
              onChoose={() => onChooseOption(recommended.id)}
              resultingHealthLabel={t.resultingHealth}
            />
          </div>
        </section>

        {otherOptions.length > 0 ? (
          <section>
            <h3 className="text-body-sm font-medium text-text-secondary">{t.otherOptions}</h3>
            <div className="mt-2 flex flex-col gap-2">
              {otherOptions.slice(0, 2).map((option) => (
                <OptionBlock
                  key={option.id}
                  option={option}
                  onChoose={() => onChooseOption(option.id)}
                  resultingHealthLabel={t.resultingHealth}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <h3 className="text-body-sm font-medium text-text-secondary sr-only">{t.keepAsIs}</h3>
          {keepAsIs.because ? (
            <p className="mb-2 text-body-sm text-text-secondary">{keepAsIs.because}</p>
          ) : null}
          {keepAsIs.resultingHealth ? (
            <p className="mb-2 flex items-center gap-2 text-caption text-text-secondary">
              {t.resultingHealth}
              <HealthPill state={keepAsIs.resultingHealth} />
            </p>
          ) : null}
          <Button variant="tertiary" fullWidth onClick={onKeepAsIs}>
            {keepAsIs.label ?? t.keepAsIs}
          </Button>
        </section>
      </div>
    </BottomSheet>
  );
}

export type { ChangeCardProps };
