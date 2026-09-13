"use client";

import { Button } from "@mandhira/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSource, updateSource } from "@/app/(ops)/sources/actions";

const SOURCE_TYPES = [
  { value: "official_authority", label: "Official authority", tier: "T1" },
  { value: "official_destination_org", label: "Official destination organisation", tier: "T2" },
  { value: "government", label: "Government", tier: "T2" },
  { value: "licensed_provider", label: "Licensed provider", tier: "T2" },
  { value: "partner", label: "Approved partner", tier: "T3" },
  { value: "structured_service", label: "Structured service / API", tier: "T3" },
  { value: "curated_research", label: "Curated research", tier: "T4" },
  { value: "user_report", label: "Traveler report", tier: "T5" },
] as const;

const TIERS = [
  { value: "T1", label: "T1 — Official authority" },
  { value: "T2", label: "T2 — Official destination org or licensed provider" },
  { value: "T3", label: "T3 — Approved partner or structured service" },
  { value: "T4", label: "T4 — Curated research" },
  { value: "T5", label: "T5 — Traveler report" },
] as const;

export type SourceDraft = {
  id?: string;
  name: string;
  source_type: (typeof SOURCE_TYPES)[number]["value"];
  tier: (typeof TIERS)[number]["value"];
  url: string;
  contact: string;
  refresh_cadence_days: number | null;
  ingestion_method: "manual" | "url_monitor";
  status: "active" | "paused" | "retired";
  notes: string;
};

export const EMPTY_SOURCE: SourceDraft = {
  name: "",
  source_type: "official_authority",
  tier: "T1",
  url: "",
  contact: "",
  refresh_cadence_days: null,
  ingestion_method: "manual",
  status: "active",
  notes: "",
};

/**
 * Source editor (O08).
 *
 * Choosing a type suggests its usual tier, because the two are related but not locked:
 * PRD F17 pairs them, yet a government page can be a poorer source than a temple's own
 * notice board. The operator can always override — the suggestion saves a decision, it
 * does not make one.
 */
export function SourceForm({ initial }: { initial: SourceDraft }) {
  const router = useRouter();
  const [draft, setDraft] = useState<SourceDraft>(initial);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const set = <K extends keyof SourceDraft>(key: K, value: SourceDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const fieldError = (name: string) => errors[name]?.[0];

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError(null);

    const result = initial.id
      ? await updateSource({ ...draft, id: initial.id })
      : await createSource(draft);

    setSaving(false);
    if (!result.ok) {
      setErrors(result.error.fieldErrors ?? {});
      setFormError(result.error.message);
      return;
    }

    router.push("/sources");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-6">
      <label className="flex flex-col gap-1 text-body-sm font-medium">
        Name
        <input
          value={draft.name}
          onChange={(e) => set("name", e.target.value)}
          required
          placeholder="e.g. Kashi Vishwanath Temple Trust"
          className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
        />
        {fieldError("name") ? (
          <span className="text-body-sm font-normal text-status-tight">{fieldError("name")}</span>
        ) : null}
      </label>

      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1 text-body-sm font-medium">
          Kind of source
          <select
            value={draft.source_type}
            onChange={(e) => {
              const next = e.target.value as SourceDraft["source_type"];
              const suggested = SOURCE_TYPES.find((t) => t.value === next)?.tier;
              setDraft((d) => ({
                ...d,
                source_type: next,
                ...(suggested ? { tier: suggested as SourceDraft["tier"] } : {}),
              }));
            }}
            className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
          >
            {SOURCE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-1 flex-col gap-1 text-body-sm font-medium">
          Trust tier
          <select
            value={draft.tier}
            onChange={(e) => set("tier", e.target.value as SourceDraft["tier"])}
            className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
          >
            {TIERS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <span className="text-caption font-normal text-text-secondary">
            Only T1 and T2 produce high confidence for travelers.
          </span>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-body-sm font-medium">
        URL
        <input
          type="url"
          value={draft.url}
          onChange={(e) => set("url", e.target.value)}
          placeholder="https://…"
          className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
        />
        {fieldError("url") ? (
          <span className="text-body-sm font-normal text-status-tight">{fieldError("url")}</span>
        ) : null}
      </label>

      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1 text-body-sm font-medium">
          Contact
          <input
            value={draft.contact}
            onChange={(e) => set("contact", e.target.value)}
            className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
          />
        </label>
        <label className="flex w-52 flex-col gap-1 text-body-sm font-medium">
          Re-check every (days)
          <input
            type="number"
            min={1}
            value={draft.refresh_cadence_days ?? ""}
            onChange={(e) =>
              set("refresh_cadence_days", e.target.value === "" ? null : Number(e.target.value))
            }
            className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
          />
        </label>
        {/*
          The switch that makes a source watched (PRD F17). Only two of the schema's four
          methods are offered: `api` and `file_upload` exist in the enum and nothing runs
          them, and offering a method that does nothing is worse than not offering it —
          an operator would configure it and believe the source was being monitored.
        */}
        <label className="flex w-56 flex-col gap-1 text-body-sm font-medium">
          Ingestion method
          <select
            value={draft.ingestion_method}
            onChange={(e) =>
              set("ingestion_method", e.target.value as SourceDraft["ingestion_method"])
            }
            className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
          >
            <option value="manual">Checked by hand</option>
            {/*
              Deliberately not "Watch the URL". A `<label>` wrapping a `<select>` folds its
              OPTION text into the control's accessible name, so that wording made every
              `getByLabel("URL")` in the suite ambiguous with the URL field above — and it
              would do the same to a screen reader user hunting for the URL box.
            */}
            <option value="url_monitor">Watch the page for changes</option>
          </select>
        </label>
        <label className="flex w-40 flex-col gap-1 text-body-sm font-medium">
          Status
          <select
            value={draft.status}
            onChange={(e) => set("status", e.target.value as SourceDraft["status"])}
            className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
          >
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="retired">Retired</option>
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-body-sm font-medium">
        Notes
        <textarea
          rows={3}
          value={draft.notes}
          onChange={(e) => set("notes", e.target.value)}
          className="focus-ring rounded-input border border-border-subtle bg-surface px-3 py-2 text-body font-normal"
        />
      </label>

      <p className="text-caption text-text-secondary">
        A source set to watch its page is fetched on its re-check cadence (daily if none is set).
        Each capture is compared with the last, and a change candidate goes to the Review queue when
        the wording a field was verified against disappears. A source checked by hand is never
        fetched.
      </p>

      {formError ? (
        <p role="alert" className="text-body-sm text-status-tight">
          {formError}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" loading={saving}>
          {initial.id ? "Save changes" : "Register source"}
        </Button>
        <Button type="button" variant="tertiary" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
