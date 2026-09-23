"use client";

import { AlertTriangle, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

export type AdvisoryNoticeView = {
  id: string;
  title: string;
  body: string;
  severity: "info" | "caution" | "important";
  /** Already worded in the reader's language, or null when the advisory has no window. */
  dates: string | null;
  sourceName: string | null;
  /** "Updated [date]" — PRD F10's label for curated information, already worded. */
  updated: string | null;
};

const dismissedKey = (id: string) => `mandhira:advisory-dismissed:${id}`;

/**
 * Destination advisories on a journey (PRD A25: title, body, dates, source, Dismiss).
 *
 * Dismissing hides a notice on this device only — it is the traveler saying "I have read
 * this", not the advisory ending. Remembered per advisory, so a new one still appears. Read
 * after mount: the server shows every notice, and the browser then hides the ones already
 * dismissed, which is the safe direction for a warning to err in.
 */
export function AdvisoryNotices({ advisories }: { advisories: AdvisoryNoticeView[] }) {
  const t = useTranslations("advisoryNotice");
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const found = new Set<string>();
    try {
      for (const advisory of advisories) {
        if (window.localStorage.getItem(dismissedKey(advisory.id))) found.add(advisory.id);
      }
    } catch {
      // Storage blocked: every notice stays visible.
    }
    setDismissed(found);
  }, [advisories]);

  function dismiss(id: string) {
    try {
      window.localStorage.setItem(dismissedKey(id), "1");
    } catch {
      // Hidden for this visit only.
    }
    setDismissed((current) => new Set(current).add(id));
  }

  const visible = advisories.filter((advisory) => !dismissed.has(advisory.id));
  if (visible.length === 0) return null;

  return (
    <section aria-label={t("label")} className="flex flex-col gap-3">
      {visible.map((advisory) => (
        <div
          key={advisory.id}
          className={`flex gap-3 rounded-lg border bg-bg-surface p-4 ${
            advisory.severity === "important" ? "border-status-broken" : "border-border"
          }`}
        >
          {advisory.severity === "info" ? (
            <Info className="size-5 shrink-0 text-text-secondary" aria-hidden />
          ) : (
            <AlertTriangle
              className={`size-5 shrink-0 ${
                advisory.severity === "important" ? "text-status-broken" : "text-status-tight"
              }`}
              aria-hidden
            />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 className="text-body font-medium">{advisory.title}</h2>
            <p className="text-body-sm text-text-secondary">{advisory.body}</p>
            {advisory.dates ? (
              <p className="text-caption text-text-secondary">{advisory.dates}</p>
            ) : null}
            {advisory.sourceName || advisory.updated ? (
              <p className="text-caption text-text-secondary">
                {[
                  advisory.sourceName ? t("source", { source: advisory.sourceName }) : null,
                  advisory.updated,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => dismiss(advisory.id)}
              className="focus-ring min-h-11 self-start text-body-sm font-medium text-brand-primary-text"
            >
              {t("dismiss")}
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
