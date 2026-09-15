"use client";

import { Button } from "@mandhira/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createCircuit, updateCircuit } from "@/app/(ops)/circuits/actions";
import { I18nFields, type LocaleOption } from "./i18n-fields";

export type CircuitDraft = {
  id?: string;
  slug: string;
  name_i18n: Record<string, string>;
  description_i18n: Record<string, string>;
};

const EMPTY: CircuitDraft = { slug: "", name_i18n: {}, description_i18n: {} };

/**
 * A circuit's name, slug and description (OPS-REL-01). Field messages come from the server
 * action's Zod validation, as in every other editor.
 */
export function CircuitForm({
  locales,
  initial,
}: {
  locales: LocaleOption[];
  initial?: CircuitDraft;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<CircuitDraft>(initial ?? EMPTY);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const fieldError = (name: string) => errors[name]?.[0];

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setErrors({});
    setFormError(null);

    const result = initial?.id
      ? await updateCircuit({ ...draft, id: initial.id })
      : await createCircuit(draft);

    setSaving(false);

    if (!result.ok) {
      setErrors(result.error.fieldErrors ?? {});
      setFormError(result.error.message);
      return;
    }

    if (!initial?.id) {
      router.push(`/circuits/${result.data.id}`);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      noValidate
      className="flex max-w-2xl flex-col gap-5"
    >
      <div className="flex flex-col gap-1">
        <I18nFields
          label="Name"
          locales={locales}
          value={draft.name_i18n}
          onChange={(value) => setDraft((d) => ({ ...d, name_i18n: value }))}
        />
        {fieldError("name_i18n") ? (
          <p className="text-body-sm text-status-tight">{fieldError("name_i18n")}</p>
        ) : null}
      </div>

      <label className="flex flex-col gap-1 text-body-sm font-medium">
        Slug
        <input
          value={draft.slug}
          onChange={(event) => setDraft((d) => ({ ...d, slug: event.target.value }))}
          aria-invalid={fieldError("slug") ? true : undefined}
          aria-describedby="circuit-slug-hint"
          className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
        />
        <span id="circuit-slug-hint" className="text-caption font-normal text-text-secondary">
          {fieldError("slug") ?? "Lowercase words separated by hyphens, for example char-dham."}
        </span>
      </label>

      <I18nFields
        label="Description"
        locales={locales}
        value={draft.description_i18n}
        onChange={(value) => setDraft((d) => ({ ...d, description_i18n: value }))}
        multiline
      />

      {formError ? (
        <p role="alert" className="text-body-sm text-status-tight">
          {formError}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" loading={saving}>
          {initial?.id ? "Save circuit" : "Create circuit"}
        </Button>
        {saved ? (
          <span role="status" className="text-body-sm text-status-comfortable">
            ● Saved
          </span>
        ) : null}
      </div>
    </form>
  );
}
