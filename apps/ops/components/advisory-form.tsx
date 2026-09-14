"use client";

import { Button } from "@mandhira/ui/components/ui/button";
import { Input } from "@mandhira/ui/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@mandhira/ui/components/ui/native-select";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createAdvisory, updateAdvisory } from "@/app/(ops)/advisories/actions";
import { fromDateTimeLocal, toDateTimeLocal } from "@/lib/datetime";
import { I18nFields, type LocaleOption } from "./i18n-fields";

export type AdvisoryDraft = {
  id?: string;
  destination_id: string;
  title_i18n: Record<string, string>;
  body_i18n: Record<string, string>;
  severity: "info" | "caution" | "important";
  starts_at: string | null;
  ends_at: string | null;
  source_id: string | null;
};

const SEVERITIES = [
  { value: "info", label: "Information" },
  { value: "caution", label: "Caution" },
  { value: "important", label: "Important" },
] as const;

/**
 * Advisory editor (O19). The window is in the operator's local time and stored as an
 * instant; the source is what the advisory's trust rests on, since it has no critical field.
 */
export function AdvisoryForm({
  locales,
  destinations,
  sources,
  initial,
}: {
  locales: LocaleOption[];
  destinations: { id: string; label: string }[];
  sources: { id: string; label: string; tier: string }[];
  initial: AdvisoryDraft;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(initial);
  const [starts, setStarts] = useState(toDateTimeLocal(initial.starts_at));
  const [ends, setEnds] = useState(toDateTimeLocal(initial.ends_at));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof AdvisoryDraft>(key: K, value: AdvisoryDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const fieldError = (name: string) => errors[name]?.[0];

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    setSaved(false);

    const payload = {
      destination_id: draft.destination_id,
      title_i18n: draft.title_i18n,
      body_i18n: draft.body_i18n,
      severity: draft.severity,
      starts_at: fromDateTimeLocal(starts),
      ends_at: fromDateTimeLocal(ends),
      source_id: draft.source_id,
    };

    startTransition(async () => {
      const result = initial.id
        ? await updateAdvisory({ id: initial.id, ...payload })
        : await createAdvisory(payload);

      if (!result.ok) {
        setErrors(result.error.fieldErrors ?? {});
        setFormError(result.error.message);
        return;
      }
      if (initial.id) {
        setSaved(true);
        router.refresh();
      } else {
        router.push(`/advisories/${result.data.id}`);
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-wrap gap-3">
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <label htmlFor="advisory-destination" className="text-body-sm font-medium">
            Destination
          </label>
          <NativeSelect
            id="advisory-destination"
            className="w-full"
            value={draft.destination_id}
            onChange={(e) => set("destination_id", e.target.value)}
          >
            {destinations.map((destination) => (
              <NativeSelectOption key={destination.id} value={destination.id}>
                {destination.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="flex w-full flex-col sm:w-48 gap-1">
          <label htmlFor="advisory-severity" className="text-body-sm font-medium">
            Severity
          </label>
          <NativeSelect
            id="advisory-severity"
            className="w-full"
            value={draft.severity}
            onChange={(e) => set("severity", e.target.value as AdvisoryDraft["severity"])}
          >
            {SEVERITIES.map((severity) => (
              <NativeSelectOption key={severity.value} value={severity.value}>
                {severity.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </div>

      <I18nFields
        label="Title"
        locales={locales}
        value={draft.title_i18n}
        onChange={(v) => set("title_i18n", v)}
        {...(fieldError("title_i18n") ? { describedBy: "advisory-title-error" } : {})}
      />
      {fieldError("title_i18n") ? (
        <p id="advisory-title-error" className="-mt-4 text-body-sm text-destructive">
          {fieldError("title_i18n")}
        </p>
      ) : null}

      <I18nFields
        label="Notice"
        locales={locales}
        multiline
        value={draft.body_i18n}
        onChange={(v) => set("body_i18n", v)}
      />

      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="advisory-starts" className="text-body-sm font-medium">
            Starts
          </label>
          <Input
            id="advisory-starts"
            type="datetime-local"
            value={starts}
            onChange={(e) => setStarts(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="advisory-ends" className="text-body-sm font-medium">
            Ends
          </label>
          <Input
            id="advisory-ends"
            type="datetime-local"
            value={ends}
            aria-invalid={fieldError("ends_at") ? true : undefined}
            onChange={(e) => setEnds(e.target.value)}
          />
          {fieldError("ends_at") ? (
            <span className="text-body-sm text-destructive">{fieldError("ends_at")}</span>
          ) : null}
        </div>
        <p className="basis-full text-caption text-text-secondary">
          Your local time. Leave either blank for a notice with no start or no end.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="advisory-source" className="text-body-sm font-medium">
          Source
        </label>
        <NativeSelect
          id="advisory-source"
          className="w-full"
          value={draft.source_id ?? ""}
          onChange={(e) => set("source_id", e.target.value || null)}
          aria-describedby="advisory-source-hint"
        >
          <NativeSelectOption value="">No source recorded</NativeSelectOption>
          {sources.map((source) => (
            <NativeSelectOption key={source.id} value={source.id}>
              {source.label} ({source.tier})
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <span id="advisory-source-hint" className="text-caption text-text-secondary">
          Who says so. Travelers see the source beside the notice.
        </span>
      </div>

      <div aria-live="polite">
        {formError ? (
          <p role="alert" className="text-body-sm text-destructive">
            {formError}
          </p>
        ) : null}
        {saved ? <p className="text-body-sm text-text-secondary">Saved.</p> : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {initial.id ? "Save changes" : "Create advisory"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>

      <p className="text-caption text-text-tertiary">
        Saved as a draft. Publishing happens through review and approval, not from this form.
      </p>
    </form>
  );
}
