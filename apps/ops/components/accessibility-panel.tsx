"use client";

import { Button } from "@mandhira/ui";
import { useState } from "react";
import { saveAccessibility } from "@/app/(ops)/routes/actions";
import { I18nFields, type LocaleOption } from "./i18n-fields";

const GRADES = [
  { value: "", label: "Not recorded" },
  { value: "yes", label: "Yes" },
  { value: "partial", label: "Partly" },
  { value: "no", label: "No" },
] as const;

export type AccessibilityValues = {
  step_free: string | null;
  wheelchair_access: string | null;
  queue_assistance: boolean | null;
  rest_seating: boolean | null;
  distance_from_dropoff_m: number | null;
  notes_i18n: Record<string, string>;
};

/**
 * Accessibility record for a place or route (O06, OPS-EDIT-06).
 *
 * PRD-HLTH-005 gives the engine hard defaults from these values — step-free routing for
 * wheelchair users, distance budgets for limited mobility — so "not recorded" is kept
 * distinct from "no". Guessing on a traveler's behalf is the one thing this data must
 * never do.
 */
export function AccessibilityPanel({
  locales,
  target,
  initial,
}: {
  locales: LocaleOption[];
  target: { placeId?: string; routeId?: string };
  initial: AccessibilityValues;
}) {
  const [values, setValues] = useState<AccessibilityValues>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const set = <K extends keyof AccessibilityValues>(key: K, value: AccessibilityValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setSaved(false);
  };

  async function save() {
    setSaving(true);
    setProblem(null);

    const result = await saveAccessibility({
      place_id: target.placeId ?? null,
      route_id: target.routeId ?? null,
      ...values,
    });

    setSaving(false);
    if (!result.ok) {
      setProblem(Object.values(result.error.fieldErrors ?? {})[0]?.[0] ?? result.error.message);
      return;
    }
    setSaved(true);
  }

  const grade = (label: string, key: "step_free" | "wheelchair_access") => (
    <label className="flex min-w-48 flex-1 flex-col gap-1 text-body-sm font-medium">
      {label}
      <select
        value={values[key] ?? ""}
        onChange={(e) => set(key, e.target.value || null)}
        className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
      >
        {GRADES.map((g) => (
          <option key={g.value} value={g.value}>
            {g.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <section className="flex flex-col gap-4 rounded-card border border-border-subtle bg-surface p-4">
      <div>
        <h2 className="text-h3">Accessibility</h2>
        <p className="mt-1 text-body-sm text-text-secondary">
          The engine plans around these. Leave anything unknown as “not recorded” — a guess here
          becomes a promise to a traveler who depends on it.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        {grade("Step-free", "step_free")}
        {grade("Wheelchair access", "wheelchair_access")}
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-body-sm">
          <input
            type="checkbox"
            checked={values.queue_assistance ?? false}
            onChange={(e) => set("queue_assistance", e.target.checked)}
            className="focus-ring size-5"
          />
          Queue assistance available
        </label>
        <label className="flex items-center gap-2 text-body-sm">
          <input
            type="checkbox"
            checked={values.rest_seating ?? false}
            onChange={(e) => set("rest_seating", e.target.checked)}
            className="focus-ring size-5"
          />
          Seating to rest
        </label>
      </div>

      <label className="flex w-full flex-col sm:w-64 gap-1 text-body-sm font-medium">
        Walk from drop-off (metres)
        <input
          type="number"
          min={0}
          value={values.distance_from_dropoff_m ?? ""}
          onChange={(e) =>
            set("distance_from_dropoff_m", e.target.value === "" ? null : Number(e.target.value))
          }
          className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
        />
      </label>

      <I18nFields
        label="Notes"
        locales={locales}
        multiline
        value={values.notes_i18n}
        onChange={(v) => set("notes_i18n", v)}
      />

      {problem ? (
        <p role="alert" className="text-body-sm text-status-tight">
          {problem}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="button" loading={saving} onClick={() => void save()}>
          Save accessibility
        </Button>
        {saved ? (
          <span role="status" className="text-body-sm text-status-comfortable">
            ● Saved
          </span>
        ) : null}
      </div>
    </section>
  );
}
