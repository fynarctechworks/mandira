"use client";

import { Button } from "@mandhira/ui";
import { useId, useState, useTransition } from "react";

import { openConflict } from "@/app/(ops)/conflicts/actions";

/**
 * "These sources disagree" (PRD-OPS-SRC-005, raised by hand — see OPEN-014).
 *
 * Lives beside a field's trust panel because that is where somebody NOTICES: they are
 * recording what one source says, they remember another said something else, and this is
 * the moment to say so rather than a queue they have to remember to visit.
 *
 * What it does is not bookkeeping. `open_conflict` sets `conflict_flag`, which drops the
 * field to low confidence through `derive_confidence` and reaches the traveler through the
 * published views. So opening one is a decision to stop telling people that field is
 * certain — which is exactly right while two sources disagree, and is why it takes two
 * values and refuses one.
 */
export function RaiseConflict({
  entityTable,
  entityId,
  fieldName,
  fieldLabel,
  sources,
  alreadyFlagged,
}: {
  entityTable: string;
  entityId: string;
  fieldName: string;
  fieldLabel: string;
  sources: { id: string; label: string; tier: string }[];
  alreadyFlagged: boolean;
}) {
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [rows, setRows] = useState([
    { sourceId: "", value: "" },
    { sourceId: "", value: "" },
  ]);

  function set(index: number, patch: Partial<{ sourceId: string; value: string }>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function submit() {
    setProblem(null);

    const filled = rows.filter((row) => row.sourceId && row.value.trim());
    if (filled.length < 2) {
      setProblem("Name two sources and what each of them says.");
      return;
    }
    if (new Set(filled.map((row) => row.sourceId)).size < filled.length) {
      // A source disagreeing with itself is a source that changed, which is a re-verify.
      setProblem("Those are the same source twice — a conflict is between two of them.");
      return;
    }

    startTransition(async () => {
      const result = await openConflict({
        entityTable,
        entityId,
        fieldName,
        values: filled.map((row) => ({
          source_id: row.sourceId,
          tier: sources.find((source) => source.id === row.sourceId)?.tier ?? "",
          value: row.value.trim(),
        })),
      });

      if (!result.ok) {
        setProblem(result.error.message);
        return;
      }

      setDone(true);
      setOpen(false);
    });
  }

  if (alreadyFlagged || done) {
    return (
      <p className="text-caption text-status-tight">
        Sources disagree about this. Travelers see it as low confidence until it is settled in
        Conflicts.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="tertiary" onClick={() => setOpen((v) => !v)}>
        {open ? "Never mind" : "Sources disagree"}
      </Button>

      {open ? (
        <div className="flex flex-col gap-2 border-t border-border-subtle pt-2">
          <p className="text-caption text-text-secondary">
            Recording this shows {fieldLabel.toLowerCase()} to travelers as low confidence until
            somebody settles it. It does not change the value.
          </p>

          {rows.map((row, index) => (
            <div key={`${ids}-${index}`} className="flex flex-col gap-1">
              <label htmlFor={`${ids}-source-${index}`} className="text-caption text-text-secondary">
                Source {index + 1}
              </label>
              <select
                id={`${ids}-source-${index}`}
                value={row.sourceId}
                onChange={(event) => set(index, { sourceId: event.target.value })}
                className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-2 text-body-sm"
              >
                <option value="">Choose a source</option>
                {sources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.label}
                  </option>
                ))}
              </select>

              <label htmlFor={`${ids}-value-${index}`} className="text-caption text-text-secondary">
                What it says
              </label>
              <input
                id={`${ids}-value-${index}`}
                value={row.value}
                maxLength={500}
                onChange={(event) => set(index, { value: event.target.value })}
                className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-2 text-body-sm"
              />
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={submit} disabled={pending} loading={pending}>
              Record the disagreement
            </Button>
            {rows.length < 4 ? (
              <button
                type="button"
                onClick={() => setRows((current) => [...current, { sourceId: "", value: "" }])}
                className="focus-ring min-h-11 rounded-lg px-2 text-body-sm underline"
              >
                Another source
              </button>
            ) : null}
          </div>

          {problem ? (
            <p role="alert" className="text-body-sm text-status-tight">
              {problem}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
