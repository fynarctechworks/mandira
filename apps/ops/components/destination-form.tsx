"use client";

import { Button } from "@mandhira/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createDestination, updateDestination } from "@/app/(ops)/destinations/actions";
import { I18nFields, type LocaleOption } from "./i18n-fields";
import { LocationPicker } from "./location-picker";

export type DestinationDraft = {
  id?: string;
  slug: string;
  name_i18n: Record<string, string>;
  region: string | null;
  state: string | null;
  country: string;
  overview_i18n: Record<string, string>;
  best_seasons_i18n: Record<string, string>;
  seasonal_notes_i18n: Record<string, string>;
  radius_km: number;
  editorial_weight: number;
  latitude: number | null;
  longitude: number | null;
};

const EMPTY: DestinationDraft = {
  slug: "",
  name_i18n: {},
  region: null,
  state: null,
  country: "IN",
  overview_i18n: {},
  best_seasons_i18n: {},
  seasonal_notes_i18n: {},
  radius_km: 5,
  editorial_weight: 3,
  latitude: null,
  longitude: null,
};

/**
 * Destination editor (O02, OPS-EDIT-01).
 *
 * Field-level messages come back from the server action's Zod validation rather than being
 * duplicated client-side: one definition of what is valid, and it is the one the database
 * actually sits behind.
 */
export function DestinationForm({
  locales,
  initial,
}: {
  locales: LocaleOption[];
  initial?: DestinationDraft;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<DestinationDraft>(initial ?? EMPTY);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const set = <K extends keyof DestinationDraft>(key: K, value: DestinationDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const fieldError = (name: string) => errors[name]?.[0];

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError(null);

    const result = initial?.id
      ? await updateDestination({ ...draft, id: initial.id })
      : await createDestination(draft);

    setSaving(false);

    if (!result.ok) {
      setErrors(result.error.fieldErrors ?? {});
      setFormError(result.error.message);
      return;
    }

    router.push(`/destinations/${result.data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-6">
      <I18nFields
        label="Name"
        locales={locales}
        value={draft.name_i18n}
        onChange={(v) => set("name_i18n", v)}
        {...(fieldError("name_i18n") ? { describedBy: "name-error" } : {})}
      />
      {fieldError("name_i18n") ? (
        <p id="name-error" className="text-body-sm text-status-tight">
          {fieldError("name_i18n")}
        </p>
      ) : null}

      <label className="flex flex-col gap-1 text-body-sm font-medium">
        Slug
        <input
          value={draft.slug}
          onChange={(e) => set("slug", e.target.value)}
          required
          aria-invalid={fieldError("slug") ? true : undefined}
          {...(fieldError("slug") ? { "aria-describedby": "slug-error" } : {})}
          className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
        />
        <span className="text-caption font-normal text-text-tertiary">
          Used in the traveler URL. Lowercase words separated by hyphens.
        </span>
        {fieldError("slug") ? (
          <span id="slug-error" className="text-body-sm text-status-tight">
            {fieldError("slug")}
          </span>
        ) : null}
      </label>

      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1 text-body-sm font-medium">
          Region
          <input
            value={draft.region ?? ""}
            onChange={(e) => set("region", e.target.value || null)}
            className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-body-sm font-medium">
          State
          <input
            value={draft.state ?? ""}
            onChange={(e) => set("state", e.target.value || null)}
            className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
          />
        </label>
        <label className="flex w-24 flex-col gap-1 text-body-sm font-medium">
          Country
          <input
            value={draft.country}
            onChange={(e) => set("country", e.target.value.toUpperCase())}
            maxLength={2}
            className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal uppercase"
          />
        </label>
      </div>

      <LocationPicker
        value={{ latitude: draft.latitude, longitude: draft.longitude }}
        onChange={({ latitude, longitude }) => setDraft((d) => ({ ...d, latitude, longitude }))}
        country={draft.country}
        {...(fieldError("latitude") ? { describedBy: "centre-error" } : {})}
      />
      {fieldError("latitude") ? (
        <p id="centre-error" className="text-body-sm text-status-tight">
          {fieldError("latitude")}
        </p>
      ) : null}

      <label className="flex w-48 flex-col gap-1 text-body-sm font-medium">
        Offline radius (km)
        <input
          type="number"
          min={1}
          max={200}
          value={draft.radius_km}
          onChange={(e) => set("radius_km", Number(e.target.value))}
          className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
        />
        <span className="text-caption font-normal text-text-tertiary">
          How far around the centre is saved for offline use.
        </span>
      </label>

      <I18nFields
        label="Overview"
        locales={locales}
        multiline
        value={draft.overview_i18n}
        onChange={(v) => set("overview_i18n", v)}
      />
      <I18nFields
        label="Best seasons"
        locales={locales}
        multiline
        value={draft.best_seasons_i18n}
        onChange={(v) => set("best_seasons_i18n", v)}
      />

      <label className="flex w-48 flex-col gap-1 text-body-sm font-medium">
        Editorial weight
        <input
          type="number"
          min={1}
          max={5}
          value={draft.editorial_weight}
          onChange={(e) => set("editorial_weight", Number(e.target.value))}
          className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
        />
        <span className="text-caption font-normal text-text-tertiary">
          1–5. Ranks discovery results; never a popularity score.
        </span>
      </label>

      {formError ? (
        <p role="alert" className="text-body-sm text-status-tight">
          {formError}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" loading={saving}>
          {initial?.id ? "Save changes" : "Create destination"}
        </Button>
        <Button type="button" variant="tertiary" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>

      <p className="text-caption text-text-tertiary">
        Saved as a draft. Publishing happens through review and approval, not from this form.
      </p>
    </form>
  );
}
