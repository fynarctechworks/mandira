"use client";

import type { CriticalField } from "@mandhira/db";
import { Button } from "@mandhira/ui";

import { RaiseConflict } from "./raise-conflict";
import { useId, useState } from "react";
import { saveTrustRecord } from "@/app/(ops)/trust/actions";

export type TrustRecord = {
  id: string;
  field_name: string | null;
  source_id: string | null;
  verification_status: string;
  verified_at: string | null;
  valid_until: string | null;
  evidence_url: string | null;
  evidence_excerpt: string | null;
  conflict_flag: boolean;
  freshness: string;
  confidence: string;
};

const STATUSES = [
  { value: "unverified", label: "Not checked" },
  { value: "ai_extracted", label: "Extracted by AI" },
  { value: "human_reviewed", label: "Reviewed by a person" },
  { value: "verified", label: "Verified against a source" },
  { value: "disputed", label: "Disputed" },
] as const;

/** Icon + word, never colour alone (PRD §12.8). */
const CONFIDENCE_MARK: Record<string, string> = { high: "✓", medium: "◐", low: "!" };

/**
 * Inline trust panel for one critical field (OPS-EDIT-09, TRD §11.2 Day 6).
 *
 * The gate this satisfies is strict: until every critical field on an entity reaches
 * `human_reviewed`, the entity is invisible to travelers no matter how complete it looks
 * (D-030). So the panel leads with what is missing and why the field matters, rather than
 * presenting itself as optional metadata.
 *
 * Freshness and confidence are shown but never edited — the database derives them, and
 * they are what the traveler's badge reads.
 */
export function TrustPanel({
  entityTable,
  entityId,
  field,
  sources,
  record,
}: {
  entityTable: string;
  entityId: string;
  field: CriticalField;
  sources: { id: string; label: string; tier: string }[];
  record: TrustRecord | undefined;
}) {
  /*
   * Selects are associated by id rather than wrapped in their label. A <label> that WRAPS
   * a <select> makes the accessible name include every option — "Source No source Temple
   * Trust (T1)…" — which is both unusable with a screen reader and ambiguous to match.
   */
  const ids = useId();
  const [status, setStatus] = useState(record?.verification_status ?? "unverified");
  const [sourceId, setSourceId] = useState(record?.source_id ?? "");
  const [validUntil, setValidUntil] = useState(record?.valid_until ?? "");
  const [evidenceUrl, setEvidenceUrl] = useState(record?.evidence_url ?? "");
  const [excerpt, setExcerpt] = useState(record?.evidence_excerpt ?? "");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<{ freshness: string; confidence: string } | null>(
    record ? { freshness: record.freshness, confidence: record.confidence } : null,
  );

  /*
   * The gate badge reflects what is SAVED, never the dropdown's current value.
   *
   * Deriving it from `status` made the panel announce "Clears the publish gate" the moment
   * an operator picked a status — before saving, and even if the save then failed. That is
   * exactly the wrong thing for a control whose entire job is to say whether travelers can
   * see this field.
   */
  const [savedStatus, setSavedStatus] = useState(record?.verification_status ?? "unverified");
  const gated =
    savedStatus === "human_reviewed" || savedStatus === "verified" || savedStatus === "disputed";

  async function save() {
    setBusy(true);
    setProblem(null);

    const saved = await saveTrustRecord({
      entity_table: entityTable,
      entity_id: entityId,
      field_name: field.field,
      source_id: sourceId || null,
      verification_status: status,
      valid_until: validUntil || null,
      evidence_url: evidenceUrl || null,
      evidence_excerpt: excerpt || null,
      conflict_flag: record?.conflict_flag ?? false,
    });

    setBusy(false);
    if (!saved.ok) {
      setProblem(
        saved.error.code === "failed"
          ? "That status needs a different role — a verifier confirms against a source."
          : (Object.values(saved.error.fieldErrors ?? {})[0]?.[0] ?? saved.error.message),
      );
      return;
    }
    setSavedStatus(status);
    setResult({ freshness: saved.data.freshness, confidence: saved.data.confidence });
  }

  return (
    // A named group: each panel is a distinct set of controls for one field, and without
    // a name a screen-reader user hears five identical "Status / Source / Valid until"
    // groups with nothing to tell them apart.
    <div
      role="group"
      aria-label={`Trust for ${field.label}`}
      className="rounded-card border border-border-subtle bg-surface p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-body-sm font-medium">{field.label}</p>
          <p className="text-caption text-text-secondary">
            {gated ? (
              <span className="text-status-comfortable">● Clears the publish gate</span>
            ) : (
              <span className="text-status-tight">○ Blocks publication</span>
            )}
            {result ? (
              <span className="ml-2 text-text-secondary">
                {CONFIDENCE_MARK[result.confidence] ?? "•"} {result.confidence} confidence ·{" "}
                {result.freshness}
              </span>
            ) : null}
          </p>
        </div>
        <Button type="button" variant="tertiary" onClick={() => setOpen((v) => !v)}>
          {open ? "Close" : record ? "Edit trust" : "Add trust"}
        </Button>
      </div>

      {open ? (
        <div className="mt-3 flex flex-col gap-3 border-t border-border-subtle pt-3">
          <p className="text-caption text-text-secondary">{field.why}</p>

          <div className="flex flex-wrap gap-3">
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor={`${ids}-status`} className="text-body-sm font-medium">
                Status
              </label>
              <select
                id={`${ids}-status`}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor={`${ids}-source`} className="text-body-sm font-medium">
                Source
              </label>
              <select
                id={`${ids}-source`}
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
                className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
              >
                <option value="">No source</option>
                {sources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.label} ({source.tier})
                  </option>
                ))}
              </select>
            </div>

            <label className="flex w-44 flex-col gap-1 text-body-sm font-medium">
              Valid until
              <input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-body-sm font-medium">
            Evidence URL
            <input
              type="url"
              value={evidenceUrl}
              onChange={(e) => setEvidenceUrl(e.target.value)}
              placeholder="https://…"
              className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
            />
          </label>

          <label className="flex flex-col gap-1 text-body-sm font-medium">
            Exact wording from the source
            <textarea
              rows={3}
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              className="focus-ring rounded-input border border-border-subtle bg-surface px-3 py-2 text-body font-normal"
            />
            <span className="text-caption font-normal text-text-secondary">
              Quote it rather than paraphrasing — the next person to re-verify compares against
              this.
            </span>
          </label>

          {problem ? (
            <p role="alert" className="text-body-sm text-status-tight">
              {problem}
            </p>
          ) : null}

          <div>
            <Button type="button" loading={busy} onClick={() => void save()}>
              Save trust record
            </Button>
          </div>

          {/*
            Raising a conflict lives HERE because this is where somebody notices: they are
            recording what one source says and remember another said otherwise. A queue
            they have to remember to visit separately is one where the disagreement is
            never recorded at all (PRD-OPS-SRC-005; raised by hand — OPEN-014).
          */}
          {/*
            Named fields only. A whole-entity trust record (an availability rule, TRD §4.4)
            has no field to disagree ABOUT — two sources differing there means the rule
            itself is wrong, which is an edit rather than a conflict.
          */}
          {field.field ? (
            <div className="border-t border-border-subtle pt-3">
              <RaiseConflict
                entityTable={entityTable}
                entityId={entityId}
                fieldName={field.field}
                fieldLabel={field.label}
                sources={sources}
                alreadyFlagged={record?.conflict_flag ?? false}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
