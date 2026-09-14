"use client";

import { Button } from "@mandhira/ui";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import { assignReverification } from "@/app/(ops)/freshness/actions";
import { editorPath } from "@/lib/entities";

/**
 * O15's rows and the bulk assignment (PRD F18, PRD-OPS-WF-006).
 *
 * The whole screen is one table and one button, and the interesting decisions are about
 * what each row SAYS. A date on its own ("verified 12 March") makes an operator do the
 * arithmetic; the state a traveler is seeing right now — stale, aging, low confidence — is
 * what they need, with the date as supporting detail.
 *
 * A field already on somebody's desk is shown as such rather than being offered again. A
 * queue that lets four people assign the same check is a queue that stops being trusted.
 */
export type FreshnessRow = {
  trust_id: string;
  entity_table: string;
  entity_id: string;
  field_name: string | null;
  entity_label: string;
  destination_id: string | null;
  verification_status: string;
  freshness: string;
  confidence: string;
  conflict_flag: boolean;
  report_downgrade: boolean;
  verified_at: string | null;
  valid_until: string | null;
  source_name: string | null;
  source_tier: string | null;
  has_open_task: boolean;
};

const FIELD_LABEL: Record<string, string> = {
  opening_schedule: "Opening hours",
  closure_rules_i18n: "Closure rules",
  entry_requirements_i18n: "Entry requirements",
  advance_booking_required: "Advance booking required",
  advance_booking_how_i18n: "How to book",
  duration_likely_minutes: "Usual duration",
};

export function FreshnessMonitor({ rows }: { rows: FreshnessRow[] }) {
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // Only rows nobody is already checking. Selecting one that is on a desk would produce a
  // "0 assigned" that reads as a failure rather than as "already handled".
  const assignable = useMemo(() => rows.filter((row) => !row.has_open_task), [rows]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function assign() {
    setMessage(null);
    setProblem(null);

    startTransition(async () => {
      const result = await assignReverification({ trustIds: [...selected] });

      if (!result.ok) {
        setProblem(result.error.message);
        return;
      }

      setSelected(new Set());
      setMessage(
        result.data.created === 0
          ? "Those are already waiting to be checked."
          : `${result.data.created} ${result.data.created === 1 ? "field is" : "fields are"} now waiting to be checked.`,
      );
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={assign}
          disabled={pending || selected.size === 0}
          loading={pending}
        >
          Assign re-verification
          {selected.size > 0 ? ` (${selected.size})` : ""}
        </Button>

        <button
          type="button"
          onClick={() =>
            setSelected(
              selected.size === assignable.length
                ? new Set()
                : new Set(assignable.map((row) => row.trust_id)),
            )
          }
          className="focus-ring min-h-11 rounded-lg px-2 text-body-sm underline"
        >
          {selected.size === assignable.length && assignable.length > 0
            ? "Clear selection"
            : `Select all ${assignable.length} not already being checked`}
        </button>

        {message ? (
          <p role="status" className="text-body-sm text-text-secondary">
            {message}
          </p>
        ) : null}
        {problem ? (
          <p role="alert" className="text-body-sm text-status-tight">
            {problem}
          </p>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] border-collapse text-body-sm">
          <caption className="sr-only">
            Published critical fields and when each was last checked
          </caption>
          <thead>
            <tr className="border-b border-border text-left">
              <th scope="col" className="p-2">
                <span className="sr-only">Select</span>
              </th>
              <th scope="col" className="p-2">
                What
              </th>
              <th scope="col" className="p-2">
                Field
              </th>
              <th scope="col" className="p-2">
                State
              </th>
              <th scope="col" className="p-2">
                Last checked
              </th>
              <th scope="col" className="p-2">
                Against
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.trust_id} className="border-b border-border-subtle">
                <td className="p-2">
                  {row.has_open_task ? (
                    <span className="text-caption text-text-secondary">Waiting</span>
                  ) : (
                    <>
                      <label htmlFor={`pick-${row.trust_id}`} className="sr-only">
                        Assign {row.entity_label} {row.field_name ?? "availability"}
                      </label>
                      <input
                        id={`pick-${row.trust_id}`}
                        type="checkbox"
                        checked={selected.has(row.trust_id)}
                        onChange={() => toggle(row.trust_id)}
                        className="size-5"
                      />
                    </>
                  )}
                </td>

                <td className="p-2">
                  {editorPath(row.entity_table, row.entity_id) ? (
                    <Link
                      href={editorPath(row.entity_table, row.entity_id)!}
                      className="focus-ring underline"
                    >
                      {row.entity_label}
                    </Link>
                  ) : (
                    row.entity_label
                  )}
                </td>

                <td className="p-2">
                  {row.field_name
                    ? (FIELD_LABEL[row.field_name] ?? row.field_name.replace(/_/g, " "))
                    : "Availability"}
                </td>

                <td className="p-2">
                  {/*
                    Icon-free and word-based. PRD §12.7's "icon + text" rule exists because
                    colour alone fails for a lot of people, and a freshness table is exactly
                    where a row of coloured dots would be doing all the work.
                  */}
                  <span className={row.freshness === "stale" ? "text-status-tight" : undefined}>
                    {STATE_LABEL[row.freshness] ?? row.freshness}
                  </span>
                  {row.confidence === "low" ? (
                    <span className="text-text-secondary"> · low confidence</span>
                  ) : null}
                  {row.conflict_flag ? (
                    <span className="text-status-tight"> · sources disagree</span>
                  ) : null}
                  {row.report_downgrade ? (
                    <span className="text-text-secondary"> · travelers reported it</span>
                  ) : null}
                </td>

                <td className="p-2">
                  {row.verified_at ? when(row.verified_at) : "Never"}
                  {row.valid_until ? (
                    <span className="block text-caption text-text-secondary">
                      Source vouches until {row.valid_until}
                    </span>
                  ) : null}
                </td>

                <td className="p-2 text-text-secondary">
                  {row.source_name
                    ? `${row.source_name}${row.source_tier ? ` · ${row.source_tier}` : ""}`
                    : "No source recorded"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const STATE_LABEL: Record<string, string> = {
  fresh: "Fresh",
  aging: "Aging",
  stale: "Stale",
};

function when(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}
