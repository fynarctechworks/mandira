"use client";

import { cn } from "@mandhira/ui";
import { useId, useState } from "react";

export type LocaleOption = { code: string; label: string };

/**
 * Editor for an `_i18n` jsonb column: one tab per active locale (TRD §11.2 Day 5).
 *
 * Tabs rather than a stacked list of every language, so the form stays readable as locales
 * are added — and a locale is added by inserting a `locales` row, never by editing this
 * component (D-028).
 *
 * The English tab is not special-cased as "required": PRD-KNOW-005 makes `en` the fallback,
 * and enforcing that belongs in the publish gate (B-012) where an operator is told what is
 * missing, not in a text box that blocks typing.
 */
export function I18nFields({
  label,
  locales,
  value,
  onChange,
  multiline = false,
  describedBy,
}: {
  label: string;
  locales: LocaleOption[];
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  multiline?: boolean;
  describedBy?: string;
}) {
  const groupId = useId();
  const [active, setActive] = useState(locales[0]?.code ?? "en");

  const set = (code: string, text: string) => {
    const next = { ...value };
    // Drop empty strings rather than storing them: an empty value is indistinguishable
    // from "not translated yet" to a reader, and the locale-completeness report (M4)
    // counts keys.
    if (text.trim() === "") delete next[code];
    else next[code] = text;
    onChange(next);
  };

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-body-sm font-medium">{label}</legend>

      <div role="tablist" aria-label={`${label} language`} className="flex gap-1">
        {locales.map((locale) => {
          const selected = locale.code === active;
          const filled = (value[locale.code] ?? "").trim() !== "";
          return (
            <button
              key={locale.code}
              type="button"
              role="tab"
              id={`${groupId}-tab-${locale.code}`}
              aria-selected={selected}
              aria-controls={`${groupId}-panel-${locale.code}`}
              onClick={() => setActive(locale.code)}
              className={cn(
                "focus-ring min-h-9 rounded-button px-3 text-body-sm",
                selected
                  ? "bg-brand-primary-soft font-medium text-brand-primary-text"
                  : "text-text-secondary hover:bg-surface-raised",
              )}
            >
              {locale.label}
              {/* Icon + text, never colour alone (PRD §12.8). */}
              <span className="ml-1 text-caption" aria-hidden="true">
                {filled ? "●" : "○"}
              </span>
              <span className="sr-only">{filled ? " (has content)" : " (empty)"}</span>
            </button>
          );
        })}
      </div>

      {locales.map((locale) => {
        const selected = locale.code === active;
        const fieldId = `${groupId}-panel-${locale.code}`;
        const common = {
          id: fieldId,
          value: value[locale.code] ?? "",
          onChange: (e: { target: { value: string } }) => set(locale.code, e.target.value),
          className:
            "focus-ring w-full rounded-input border border-border-subtle bg-surface px-3 py-2 text-body",
          "aria-labelledby": `${groupId}-tab-${locale.code}`,
          ...(describedBy ? { "aria-describedby": describedBy } : {}),
          // Content is authored in Indic scripts; let the browser pick the right font
          // and input mode per locale.
          lang: locale.code,
        };

        return (
          <div key={locale.code} role="tabpanel" hidden={!selected}>
            {multiline ? (
              <textarea {...common} rows={4} />
            ) : (
              <input type="text" {...common} className={`${common.className} min-h-11`} />
            )}
          </div>
        );
      })}
    </fieldset>
  );
}
