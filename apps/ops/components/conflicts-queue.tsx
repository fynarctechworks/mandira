"use client";

import { Button } from "@mandhira/ui";
import Link from "next/link";
import { useState, useTransition } from "react";

import { resolveConflict } from "@/app/(ops)/conflicts/actions";

/**
 * O12's rows and PRD F18's three resolutions (PRD-OPS-WF-003).
 *
 * Three outcomes and no fourth:
 *
 *   Choose a winner        — one source is right, and the reason says why that tier beat
 *                            the other one this time.
 *   Both valid, with context — both are right in different circumstances. Seasonal timings
 *                            and festival schedules are the common case, and forcing a
 *                            winner there would publish something wrong half the year.
 *   Escalate               — nobody here can settle it. A real answer, and it deliberately
 *                            leaves the field reading as uncertain rather than tidying an
 *                            unresolved disagreement off a queue.
 *
 * The reason is required for all three, because the person who meets this field in six
 * months needs to know what was decided and why.
 */
export type ConflictRow = {
  id: string;
  entityTable: string;
  entityId: string;
  fieldName: string | null;
  values: { source_id?: string; tier?: string; value?: string }[];
  status: string;
  winnerSourceId: string | null;
  resolutionReason: string | null;
  createdAt: string;
};

const EDITOR_PATH: Record<string, string> = {
  places: "/places",
  experiences: "/experiences",
  routes: "/routes",
  transport_connections: "/transport",
};

const FIELD_LABEL: Record<string, string> = {
  opening_schedule: "Opening hours",
  closure_rules_i18n: "Closure rules",
  entry_requirements_i18n: "Entry requirements",
  advance_booking_required: "Advance booking required",
  advance_booking_how_i18n: "How to book",
  duration_likely_minutes: "Usual duration",
};

const OUTCOME_LABEL: Record<string, string> = {
  resolved_winner: "Settled — one source won",
  resolved_both_valid: "Settled — both valid, with context",
  escalated: "Escalated, still open to travelers",
};

export function ConflictsQueue({
  rows,
  sources,
}: {
  rows: ConflictRow[];
  sources: { id: string; name: string; tier: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState<Record<string, string>>({});
  const [winner, setWinner] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);

  const sourceName = (id: string | undefined) =>
    (id ? sources.find((source) => source.id === id) : undefined)?.name ?? "Unnamed source";

  function resolve(row: ConflictRow, resolution: "winner" | "both_valid" | "escalate") {
    setProblem(null);

    // Said here as well as in the database, so an operator learns it before the round trip.
    if (!(reason[row.id] ?? "").trim()) {
      setProblem("Say what you decided and why — the next person to read this field needs it.");
      return;
    }
    if (resolution === "winner" && !winner[row.id]) {
      setProblem("Choosing a winner means naming which source won.");
      return;
    }

    startTransition(async () => {
      const result = await resolveConflict({
        id: row.id,
        resolution,
        reason: reason[row.id]!.trim(),
        ...(resolution === "winner" ? { winnerSourceId: winner[row.id]! } : {}),
      });
      if (!result.ok) setProblem(result.error.message);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {problem ? (
        <p role="alert" className="text-body-sm text-status-tight">
          {problem}
        </p>
      ) : null}

      <ul className="flex flex-col gap-3">
        {rows.map((row) => {
          const settled = row.status !== "open";

          return (
            <li
              key={row.id}
              className="flex flex-col gap-3 rounded-lg border border-border bg-bg-surface p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-h3">
                    {row.fieldName
                      ? (FIELD_LABEL[row.fieldName] ?? row.fieldName.replace(/_/g, " "))
                      : "Whole record"}
                  </h2>
                  <p className="text-caption text-text-secondary">
                    {EDITOR_PATH[row.entityTable] ? (
                      <Link
                        href={`${EDITOR_PATH[row.entityTable]}/${row.entityId}`}
                        className="focus-ring underline"
                      >
                        Open the record
                      </Link>
                    ) : (
                      row.entityTable
                    )}{" "}
                    · raised {when(row.createdAt)}
                  </p>
                </div>

                {settled ? (
                  <span className="text-body-sm text-text-secondary">
                    {OUTCOME_LABEL[row.status] ?? row.status}
                  </span>
                ) : null}
              </div>

              {/* PRD F18: all competing values, with their tiers. */}
              <ul className="flex flex-col gap-2">
                {row.values.map((value, index) => (
                  <li
                    key={`${row.id}-${index}`}
                    className="rounded-lg border-l-4 border-border bg-bg-subtle px-3 py-2 text-body-sm"
                  >
                    <span className="font-medium">{sourceName(value.source_id)}</span>
                    {value.tier ? (
                      <span className="text-text-secondary"> · {value.tier}</span>
                    ) : null}
                    {row.winnerSourceId === value.source_id ? (
                      <span className="text-status-comfortable"> · chosen</span>
                    ) : null}
                    <p className="mt-1">{value.value}</p>
                  </li>
                ))}
              </ul>

              {settled ? (
                row.resolutionReason ? (
                  <p className="text-body-sm text-text-secondary">{row.resolutionReason}</p>
                ) : null
              ) : (
                <div className="flex flex-col gap-2">
                  <label htmlFor={`reason-${row.id}`} className="text-caption text-text-secondary">
                    What you decided, and why (required)
                  </label>
                  <textarea
                    id={`reason-${row.id}`}
                    rows={2}
                    maxLength={1000}
                    value={reason[row.id] ?? ""}
                    onChange={(event) =>
                      setReason((current) => ({ ...current, [row.id]: event.target.value }))
                    }
                    className="focus-ring rounded-lg border border-border bg-bg-base p-2 text-body-sm"
                  />

                  <label htmlFor={`winner-${row.id}`} className="text-caption text-text-secondary">
                    If one source is right, which
                  </label>
                  <select
                    id={`winner-${row.id}`}
                    value={winner[row.id] ?? ""}
                    onChange={(event) =>
                      setWinner((current) => ({ ...current, [row.id]: event.target.value }))
                    }
                    className="focus-ring min-h-11 rounded-lg border border-border bg-bg-base px-2 text-body-sm"
                  >
                    <option value="">Not choosing one</option>
                    {row.values.map((value, index) => (
                      <option key={`${row.id}-opt-${index}`} value={value.source_id ?? ""}>
                        {sourceName(value.source_id)}
                      </option>
                    ))}
                  </select>

                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => resolve(row, "winner")} disabled={pending}>
                      Choose this winner
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => resolve(row, "both_valid")}
                      disabled={pending}
                    >
                      Both valid, with context
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => resolve(row, "escalate")}
                      disabled={pending}
                    >
                      Escalate
                    </Button>
                  </div>

                  <p className="text-caption text-text-secondary">
                    Escalating keeps this field reading as uncertain to travelers, which is the
                    honest state while nobody knows.
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function when(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
