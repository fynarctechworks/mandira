"use client";

import { Button } from "@mandhira/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createExperience, updateExperience } from "@/app/(ops)/experiences/actions";
import { I18nFields, type LocaleOption } from "./i18n-fields";

const EXPERIENCE_TYPES = [
  "darshan",
  "ritual",
  "aarti",
  "seva",
  "festival",
  "event",
  "walk",
  "cultural",
  "other",
] as const;

export type ExperienceDraft = {
  id?: string;
  destination_id: string;
  place_id: string | null;
  route_id: string | null;
  slug: string;
  name_i18n: Record<string, string>;
  experience_type: (typeof EXPERIENCE_TYPES)[number];
  significance_i18n: Record<string, string>;
  description_i18n: Record<string, string>;
  duration_min_minutes: number | null;
  duration_likely_minutes: number | null;
  duration_max_minutes: number | null;
  advance_booking_required: boolean;
  advance_booking_how_i18n: Record<string, string>;
  advance_booking_opens_days_before: number | null;
  eligibility_i18n: Record<string, string>;
  cost_note_i18n: Record<string, string>;
  queue_expectation_i18n: Record<string, string>;
  preparation_i18n: Record<string, string>;
  is_outdoor: boolean;
  editorial_weight: number;
};

export type AnchorOption = { id: string; label: string; kind: "place" | "route" };

/**
 * Experience editor (O04, OPS-EDIT-03).
 *
 * The anchor is ONE control listing places and routes together, not two nullable pickers.
 * The database requires exactly one (`experiences_one_anchor`), so an interface that lets
 * an operator set both — or neither — only exists to produce a rejection later.
 */
export function ExperienceForm({
  locales,
  destinations,
  anchors,
  initial,
}: {
  locales: LocaleOption[];
  destinations: { id: string; label: string }[];
  anchors: AnchorOption[];
  initial: ExperienceDraft;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<ExperienceDraft>(initial);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const set = <K extends keyof ExperienceDraft>(key: K, value: ExperienceDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const fieldError = (name: string) => errors[name]?.[0];

  const anchorValue = draft.place_id
    ? `place:${draft.place_id}`
    : draft.route_id
      ? `route:${draft.route_id}`
      : "";

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError(null);

    const result = initial.id
      ? await updateExperience({ ...draft, id: initial.id })
      : await createExperience(draft);

    setSaving(false);

    if (!result.ok) {
      setErrors(result.error.fieldErrors ?? {});
      setFormError(result.error.message);
      return;
    }

    router.push(`/experiences/${result.data.id}`);
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

      <label className="flex flex-col gap-1 text-body-sm font-medium">
        Where it happens
        <select
          value={anchorValue}
          onChange={(e) => {
            const [kind, id] = e.target.value.split(":");
            setDraft((d) => ({
              ...d,
              place_id: kind === "place" ? (id ?? null) : null,
              route_id: kind === "route" ? (id ?? null) : null,
            }));
          }}
          aria-invalid={fieldError("place_id") ? true : undefined}
          className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
        >
          <option value="">Choose a place or route</option>
          {anchors.map((anchor) => (
            <option key={`${anchor.kind}:${anchor.id}`} value={`${anchor.kind}:${anchor.id}`}>
              {anchor.label} ({anchor.kind})
            </option>
          ))}
        </select>
        {fieldError("place_id") ? (
          <span className="text-body-sm font-normal text-status-tight">
            {fieldError("place_id")}
          </span>
        ) : null}
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

      <label className="flex w-full flex-col sm:w-56 gap-1 text-body-sm font-medium">
        Type
        <select
          value={draft.experience_type}
          onChange={(e) =>
            set("experience_type", e.target.value as ExperienceDraft["experience_type"])
          }
          className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal capitalize"
        >
          {EXPERIENCE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      <I18nFields
        label="Significance"
        locales={locales}
        multiline
        value={draft.significance_i18n}
        onChange={(v) => set("significance_i18n", v)}
      />
      <I18nFields
        label="Description"
        locales={locales}
        multiline
        value={draft.description_i18n}
        onChange={(v) => set("description_i18n", v)}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-body-sm font-medium">Duration (minutes)</legend>
        <div className="flex flex-wrap gap-3">
          {(
            [
              ["Shortest", "duration_min_minutes"],
              ["Usual", "duration_likely_minutes"],
              ["Longest", "duration_max_minutes"],
            ] as const
          ).map(([label, key]) => (
            <label key={key} className="flex min-w-48 flex-1 flex-col gap-1 text-body-sm">
              {label}
              <input
                type="number"
                min={1}
                max={1440}
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
      </fieldset>

      <section className="flex flex-col gap-4 rounded-card border border-brand-primary/40 bg-brand-primary-soft/40 p-4">
        <div>
          <h2 className="text-h3">Booking</h2>
          <p className="mt-1 text-body-sm text-text-secondary">
            Critical information. If booking is required, travelers need to know how — this becomes
            a Prepare task on their journey.
          </p>
        </div>

        <label className="flex items-center gap-2 text-body-sm font-medium">
          <input
            type="checkbox"
            checked={draft.advance_booking_required}
            onChange={(e) => set("advance_booking_required", e.target.checked)}
            className="focus-ring size-5"
          />
          Advance booking required
        </label>

        {draft.advance_booking_required ? (
          <>
            <I18nFields
              label="How to book"
              locales={locales}
              multiline
              value={draft.advance_booking_how_i18n}
              onChange={(v) => set("advance_booking_how_i18n", v)}
            />
            {fieldError("advance_booking_how_i18n") ? (
              <p className="text-body-sm text-status-tight">
                {fieldError("advance_booking_how_i18n")}
              </p>
            ) : null}
            <label className="flex w-full flex-col sm:w-56 gap-1 text-body-sm font-medium">
              Booking opens (days before)
              <input
                type="number"
                min={0}
                max={730}
                value={draft.advance_booking_opens_days_before ?? ""}
                onChange={(e) =>
                  set(
                    "advance_booking_opens_days_before",
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
                className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
              />
            </label>
          </>
        ) : null}
      </section>

      <I18nFields
        label="Who can take part"
        locales={locales}
        multiline
        value={draft.eligibility_i18n}
        onChange={(v) => set("eligibility_i18n", v)}
      />
      <I18nFields
        label="What to expect in the queue"
        locales={locales}
        multiline
        value={draft.queue_expectation_i18n}
        onChange={(v) => set("queue_expectation_i18n", v)}
      />
      <I18nFields
        label="How to prepare"
        locales={locales}
        multiline
        value={draft.preparation_i18n}
        onChange={(v) => set("preparation_i18n", v)}
      />

      <label className="flex items-center gap-2 text-body-sm font-medium">
        <input
          type="checkbox"
          checked={draft.is_outdoor}
          onChange={(e) => set("is_outdoor", e.target.checked)}
          className="focus-ring size-5"
        />
        Happens outdoors
        <span className="font-normal text-caption text-text-tertiary">
          (weather advisories apply)
        </span>
      </label>

      {formError ? (
        <p role="alert" className="text-body-sm text-status-tight">
          {formError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={saving}>
          {initial.id ? "Save changes" : "Create experience"}
        </Button>
        <Button type="button" variant="tertiary" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
