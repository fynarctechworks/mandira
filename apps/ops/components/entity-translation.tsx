"use client";

import { Badge } from "@mandhira/ui/components/ui/badge";
import { Button } from "@mandhira/ui/components/ui/button";
import { Input } from "@mandhira/ui/components/ui/input";
import { Textarea } from "@mandhira/ui/components/ui/textarea";
import {
  BotIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  PencilLineIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  saveContentTranslation,
  suggestContentTranslation,
} from "@/app/(ops)/translations/actions";
import type { FieldState, TranslatableTable } from "@/lib/content-translations";

export type TranslationRow = {
  field: string;
  label: string;
  critical: boolean;
  long: boolean;
  english: string;
  target: string;
  state: FieldState;
};

/** Icon and words for every state — never colour alone (PRD §12.8). */
const STATE: Record<
  FieldState,
  {
    label: string;
    Icon: typeof CircleCheckIcon;
    variant: "outline" | "secondary" | "destructive";
  }
> = {
  confirmed: { label: "Confirmed", Icon: CircleCheckIcon, variant: "outline" },
  draft: { label: "Draft", Icon: PencilLineIcon, variant: "secondary" },
  ai_draft: { label: "AI draft", Icon: BotIcon, variant: "secondary" },
  unreviewed: { label: "Not reviewed", Icon: PencilLineIcon, variant: "secondary" },
  english_changed: {
    label: "English changed since",
    Icon: TriangleAlertIcon,
    variant: "destructive",
  },
  missing: { label: "Missing", Icon: CircleDashedIcon, variant: "destructive" },
  no_english: { label: "No English yet", Icon: CircleDashedIcon, variant: "outline" },
};

/**
 * O17's side-by-side editor for one entity in one language (PRD F19, OPS-TRANS-02).
 *
 * A suggestion only fills the box. It is saved as an AI draft if the translator saves it
 * unchanged, and it counts as done only when a person confirms it (TRD-AI-003).
 */
export function EntityTranslation({
  entityTable,
  entityId,
  locale,
  localeLabel,
  rows,
  canEdit,
}: {
  entityTable: TranslatableTable;
  entityId: string;
  locale: string;
  localeLabel: string;
  rows: TranslationRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((row) => [row.field, row.target])),
  );
  const [suggested, setSuggested] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  function save(row: TranslationRow, confirm: boolean) {
    const value = values[row.field] ?? "";
    const status = confirm
      ? "confirmed"
      : suggested[row.field] !== undefined && suggested[row.field] === value
        ? "ai_draft"
        : "draft";
    setMessage(null);
    setProblem(null);

    startTransition(async () => {
      const result = await saveContentTranslation({
        entityTable,
        entityId,
        field: row.field,
        locale,
        value,
        status,
      });
      if (!result.ok) {
        setProblem(Object.values(result.error.fieldErrors ?? {})[0]?.[0] ?? result.error.message);
        return;
      }
      setMessage(
        value.trim() === ""
          ? `${row.label} in ${localeLabel} is cleared.`
          : confirm
            ? `${row.label} in ${localeLabel} is confirmed.`
            : `${row.label} in ${localeLabel} is saved as ${status === "ai_draft" ? "an AI draft" : "a draft"}.`,
      );
      router.refresh();
    });
  }

  function suggest(row: TranslationRow) {
    setMessage(null);
    setProblem(null);

    startTransition(async () => {
      const result = await suggestContentTranslation({
        entityTable,
        entityId,
        field: row.field,
        locale,
      });
      if (!result.ok) {
        setProblem(result.error.message);
        return;
      }
      setValues((current) => ({ ...current, [row.field]: result.data.value }));
      setSuggested((current) => ({ ...current, [row.field]: result.data.value }));
      setMessage(
        `Suggestion added for ${row.label}. It stays an AI draft until you check it and confirm it.`,
      );
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div aria-live="polite" className="min-h-5">
        {message ? <p className="text-body-sm text-text-secondary">{message}</p> : null}
        {problem ? (
          <p role="alert" className="text-body-sm text-destructive">
            {problem}
          </p>
        ) : null}
      </div>

      {rows.map((row) => {
        const state = STATE[row.state];
        const inputId = `translation-${row.field}`;
        const headingId = `translation-${row.field}-heading`;
        const hasEnglish = row.english.trim() !== "";
        const editable = canEdit && hasEnglish;
        const common = {
          id: inputId,
          lang: locale,
          value: values[row.field] ?? "",
          disabled: !editable || pending,
          onChange: (e: { target: { value: string } }) =>
            setValues((current) => ({ ...current, [row.field]: e.target.value })),
        };

        return (
          <section
            key={row.field}
            aria-labelledby={headingId}
            className="flex flex-col gap-3 rounded-card border border-border-subtle p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id={headingId} className="text-h3">
                {row.label}
              </h2>
              <Badge variant={state.variant}>
                <state.Icon aria-hidden="true" />
                {state.label}
              </Badge>
            </div>
            {row.critical ? (
              <p className="text-caption text-text-secondary">
                A critical detail: travelers act on it, so the translation has to say exactly what
                the English says.
              </p>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-1">
                <span className="text-body-sm font-medium">English</span>
                <p
                  lang="en"
                  className="min-h-11 whitespace-pre-wrap rounded-input border border-border-subtle bg-surface-raised px-3 py-2 text-body"
                >
                  {hasEnglish ? row.english : "No English yet. Add it in the editor first."}
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor={inputId} className="text-body-sm font-medium">
                  {localeLabel}
                </label>
                {row.long ? <Textarea rows={4} {...common} /> : <Input {...common} />}
              </div>
            </div>

            {editable ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => suggest(row)}
                  aria-label={`Suggest ${row.label}`}
                >
                  <BotIcon aria-hidden="true" />
                  Suggest
                </Button>
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => save(row, false)}
                  aria-label={`Save draft ${row.label}`}
                >
                  Save draft
                </Button>
                <Button
                  disabled={pending || (values[row.field] ?? "").trim() === ""}
                  onClick={() => save(row, true)}
                  aria-label={`Confirm ${row.label}`}
                >
                  Confirm
                </Button>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
