"use client";

import { Button } from "@mandhira/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createRoute, updateRoute } from "@/app/(ops)/routes/actions";
import { I18nFields, type LocaleOption } from "./i18n-fields";
import { humanLabel } from "@/lib/labels";

const MODES = ["walk", "vehicle", "public_transport", "hired", "other"] as const;
const DIFFICULTIES = ["easy", "moderate", "hard"] as const;

export type RouteDraft = {
  id?: string;
  destination_id: string;
  slug: string;
  name_i18n: Record<string, string>;
  mode: (typeof MODES)[number];
  distance_m: number | null;
  duration_min_minutes: number | null;
  duration_likely_minutes: number | null;
  duration_max_minutes: number | null;
  difficulty: (typeof DIFFICULTIES)[number] | null;
  elevation_note_i18n: Record<string, string>;
};

/** Route editor (O05, OPS-EDIT-04). Stops are managed separately, on the edit page. */
export function RouteForm({
  locales,
  destinations,
  initial,
}: {
  locales: LocaleOption[];
  destinations: { id: string; label: string }[];
  initial: RouteDraft;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<RouteDraft>(initial);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const set = <K extends keyof RouteDraft>(key: K, value: RouteDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const fieldError = (name: string) => errors[name]?.[0];

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError(null);

    const result = initial.id
      ? await updateRoute({ ...draft, id: initial.id })
      : await createRoute(draft);

    setSaving(false);
    if (!result.ok) {
      setErrors(result.error.fieldErrors ?? {});
      setFormError(result.error.message);
      return;
    }

    router.push(`/routes/${result.data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-6">
      <label className="flex flex-col gap-1 text-body-sm font-medium">
        Destination
        <select
          value={draft.destination_id}
          onChange={(e) => set("destination_id", e.target.value)}
          className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
        >
          {destinations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </label>

      <I18nFields
        label="Name"
        locales={locales}
        value={draft.name_i18n}
        onChange={(v) => set("name_i18n", v)}
      />

      <label className="flex flex-col gap-1 text-body-sm font-medium">
        Slug
        <input
          value={draft.slug}
          onChange={(e) => set("slug", e.target.value)}
          required
          className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
        />
        {fieldError("slug") ? (
          <span className="text-body-sm font-normal text-status-tight">{fieldError("slug")}</span>
        ) : null}
      </label>

      <div className="flex flex-wrap gap-3">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-body-sm font-medium">
          How it is travelled
          <select
            value={draft.mode}
            onChange={(e) => set("mode", e.target.value as RouteDraft["mode"])}
            className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
          >
            {MODES.map((m) => (
              <option key={m} value={m}>
                {humanLabel(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-body-sm font-medium">
          Difficulty
          <select
            value={draft.difficulty ?? ""}
            onChange={(e) =>
              set("difficulty", (e.target.value || null) as RouteDraft["difficulty"])
            }
            className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
          >
            <option value="">Not recorded</option>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-body-sm font-medium">
          Distance (m)
          <input
            type="number"
            min={0}
            value={draft.distance_m ?? ""}
            onChange={(e) =>
              set("distance_m", e.target.value === "" ? null : Number(e.target.value))
            }
            className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
          />
        </label>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-body-sm font-medium">Time to walk it (minutes)</legend>
        <div className="flex flex-wrap gap-3">
          {(
            [
              ["Fastest", "duration_min_minutes"],
              ["Usual", "duration_likely_minutes"],
              ["Slowest", "duration_max_minutes"],
            ] as const
          ).map(([label, key]) => (
            <label key={key} className="flex min-w-48 flex-1 flex-col gap-1 text-body-sm">
              {label}
              <input
                type="number"
                min={1}
                value={draft[key] ?? ""}
                onChange={(e) => set(key, e.target.value === "" ? null : Number(e.target.value))}
                className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body"
              />
            </label>
          ))}
        </div>
        {fieldError("duration_likely_minutes") ? (
          <p className="text-body-sm text-status-tight">{fieldError("duration_likely_minutes")}</p>
        ) : null}
        <p className="text-caption text-text-tertiary">
          The slowest figure matters most: it is what a traveler with limited mobility will
          experience.
        </p>
      </fieldset>

      <I18nFields
        label="Elevation and terrain notes"
        locales={locales}
        multiline
        value={draft.elevation_note_i18n}
        onChange={(v) => set("elevation_note_i18n", v)}
      />

      {formError ? (
        <p role="alert" className="text-body-sm text-status-tight">
          {formError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={saving}>
          {initial.id ? "Save changes" : "Create route"}
        </Button>
        <Button type="button" variant="tertiary" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
