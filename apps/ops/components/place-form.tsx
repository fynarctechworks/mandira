"use client";

import type { CrowdPattern, OpeningSchedule } from "@mandhira/db";
import { Button } from "@mandhira/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPlace, updatePlace } from "@/app/(ops)/places/actions";
import { I18nFields, type LocaleOption } from "./i18n-fields";
import { LocationPicker } from "./location-picker";
import { OpeningScheduleBuilder } from "./opening-schedule-builder";
import { humanLabel } from "@/lib/labels";

const PLACE_TYPES = [
  "temple",
  "shrine",
  "sacred_site",
  "ghat",
  "viewpoint",
  "facility",
  "transport_point",
  "accommodation",
  "food",
] as const;

const FACILITY_SUBTYPES = [
  "restroom",
  "drinking_water",
  "cloakroom",
  "medical",
  "parking",
  "atm",
  "rest_area",
  "help_desk",
] as const;

const CROWD_SLOTS = ["morning", "midday", "evening"] as const;
const CROWD_LEVELS = ["low", "medium", "high"] as const;

const humanise = (value: string) => humanLabel(value);

export type PlaceDraft = {
  id?: string;
  destination_id: string;
  slug: string;
  name_i18n: Record<string, string>;
  place_type: (typeof PLACE_TYPES)[number];
  facility_subtype: (typeof FACILITY_SUBTYPES)[number] | null;
  address: string | null;
  summary_i18n: Record<string, string>;
  opening_schedule: OpeningSchedule;
  closure_rules_i18n: Record<string, string>;
  entry_requirements_i18n: Record<string, string>;
  dress_code_i18n: Record<string, string>;
  visit_duration_min_minutes: number | null;
  visit_duration_likely_minutes: number | null;
  visit_duration_max_minutes: number | null;
  crowd_pattern: CrowdPattern;
  hours_note_i18n: Record<string, string>;
  editorial_weight: number;
  latitude: number | null;
  longitude: number | null;
};

/**
 * Place editor (O03, OPS-EDIT-02).
 *
 * The three CRITICAL fields are grouped and labelled as such, because they are what gates
 * publication: an operator should be able to see at a glance what still stands between
 * this place and a traveler seeing it.
 */
export function PlaceForm({
  locales,
  destinations,
  initial,
}: {
  locales: LocaleOption[];
  destinations: { id: string; label: string }[];
  initial: PlaceDraft;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<PlaceDraft>(initial);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const set = <K extends keyof PlaceDraft>(key: K, value: PlaceDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const fieldError = (name: string) => errors[name]?.[0];

  const duration = (
    label: string,
    key:
      "visit_duration_min_minutes" | "visit_duration_likely_minutes" | "visit_duration_max_minutes",
  ) => (
    <label className="flex min-w-48 flex-1 flex-col gap-1 text-body-sm font-medium">
      {label}
      <input
        type="number"
        min={1}
        max={1440}
        value={draft[key] ?? ""}
        onChange={(e) => set(key, e.target.value === "" ? null : Number(e.target.value))}
        className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
      />
    </label>
  );

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError(null);

    const payload = {
      ...draft,
      // An empty schedule object carries no information; store null so "not recorded" is
      // unambiguous rather than being an empty-but-present value.
      opening_schedule:
        Object.keys(draft.opening_schedule.weekly ?? {}).length > 0 ? draft.opening_schedule : null,
      crowd_pattern: Object.keys(draft.crowd_pattern).length > 0 ? draft.crowd_pattern : null,
    };

    const result = initial.id
      ? await updatePlace({ ...payload, id: initial.id })
      : await createPlace(payload);

    setSaving(false);

    if (!result.ok) {
      setErrors(result.error.fieldErrors ?? {});
      setFormError(result.error.message);
      return;
    }

    router.push(`/places/${result.data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-6">
      <label className="flex flex-col gap-1 text-body-sm font-medium">
        Destination
        <select
          value={draft.destination_id}
          onChange={(e) => set("destination_id", e.target.value)}
          required
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
      {fieldError("name_i18n") ? (
        <p className="text-body-sm text-status-tight">{fieldError("name_i18n")}</p>
      ) : null}

      <label className="flex flex-col gap-1 text-body-sm font-medium">
        Slug
        <input
          value={draft.slug}
          onChange={(e) => set("slug", e.target.value)}
          required
          aria-invalid={fieldError("slug") ? true : undefined}
          className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
        />
        {fieldError("slug") ? (
          <span className="text-body-sm text-status-tight">{fieldError("slug")}</span>
        ) : null}
      </label>

      <div className="flex flex-wrap gap-3">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-body-sm font-medium">
          Type
          <select
            value={draft.place_type}
            onChange={(e) => {
              const next = e.target.value as PlaceDraft["place_type"];
              // Clearing the subtype here mirrors the DB constraint, so the operator
              // never gets a rejection for a field the form let them leave behind.
              setDraft((d) => ({
                ...d,
                place_type: next,
                facility_subtype: next === "facility" ? d.facility_subtype : null,
              }));
            }}
            className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal capitalize"
          >
            {PLACE_TYPES.map((t) => (
              <option key={t} value={t}>
                {humanise(t)}
              </option>
            ))}
          </select>
        </label>

        {draft.place_type === "facility" ? (
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-body-sm font-medium">
            Facility type
            <select
              value={draft.facility_subtype ?? ""}
              onChange={(e) =>
                set("facility_subtype", (e.target.value || null) as PlaceDraft["facility_subtype"])
              }
              className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal capitalize"
            >
              <option value="">Not set</option>
              {FACILITY_SUBTYPES.map((t) => (
                <option key={t} value={t}>
                  {humanise(t)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <label className="flex flex-col gap-1 text-body-sm font-medium">
        Address
        <input
          value={draft.address ?? ""}
          onChange={(e) => set("address", e.target.value || null)}
          className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
        />
      </label>

      <LocationPicker
        value={{ latitude: draft.latitude, longitude: draft.longitude }}
        onChange={({ latitude, longitude }) => setDraft((d) => ({ ...d, latitude, longitude }))}
      />
      {fieldError("latitude") ? (
        <p className="text-body-sm text-status-tight">{fieldError("latitude")}</p>
      ) : null}

      <I18nFields
        label="Summary"
        locales={locales}
        multiline
        value={draft.summary_i18n}
        onChange={(v) => set("summary_i18n", v)}
      />

      <section className="flex flex-col gap-4 rounded-card border border-brand-primary/40 bg-brand-primary-soft/40 p-4">
        <div>
          <h2 className="text-h3">Critical information</h2>
          <p className="mt-1 text-body-sm text-text-secondary">
            These three fields decide whether travelers see this place at all. Each needs a verified
            source before it can be published.
          </p>
        </div>

        <OpeningScheduleBuilder
          value={draft.opening_schedule}
          onChange={(v) => set("opening_schedule", v)}
        />
        <I18nFields
          label="Closure rules"
          locales={locales}
          multiline
          value={draft.closure_rules_i18n}
          onChange={(v) => set("closure_rules_i18n", v)}
        />
        <I18nFields
          label="Entry requirements"
          locales={locales}
          multiline
          value={draft.entry_requirements_i18n}
          onChange={(v) => set("entry_requirements_i18n", v)}
        />
      </section>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-body-sm font-medium">Visit duration (minutes)</legend>
        <div className="flex flex-wrap gap-3">
          {duration("Shortest", "visit_duration_min_minutes")}
          {duration("Usual", "visit_duration_likely_minutes")}
          {duration("Longest", "visit_duration_max_minutes")}
        </div>
        {fieldError("visit_duration_likely_minutes") ? (
          <p className="text-body-sm text-status-tight">
            {fieldError("visit_duration_likely_minutes")}
          </p>
        ) : null}
        <p className="text-caption text-text-tertiary">
          The engine plans with the usual duration and uses the longest for worst-case previews.
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-body-sm font-medium">Typical crowd</legend>
        <div className="flex flex-wrap gap-3">
          {CROWD_SLOTS.map((slot) => (
            <label
              key={slot}
              className="flex min-w-48 flex-1 flex-col gap-1 text-body-sm capitalize"
            >
              {slot}
              <select
                value={draft.crowd_pattern[slot] ?? ""}
                onChange={(e) => {
                  const next = { ...draft.crowd_pattern };
                  if (e.target.value === "") delete next[slot];
                  else next[slot] = e.target.value as (typeof CROWD_LEVELS)[number];
                  set("crowd_pattern", next);
                }}
                className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body"
              >
                <option value="">Not recorded</option>
                {CROWD_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </fieldset>

      <I18nFields
        label="Dress code"
        locales={locales}
        multiline
        value={draft.dress_code_i18n}
        onChange={(v) => set("dress_code_i18n", v)}
      />

      {formError ? (
        <p role="alert" className="text-body-sm text-status-tight">
          {formError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={saving}>
          {initial.id ? "Save changes" : "Create place"}
        </Button>
        <Button type="button" variant="tertiary" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
