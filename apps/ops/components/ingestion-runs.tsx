"use client";

import { Button } from "@mandhira/ui";
import Link from "next/link";
import { useState, useTransition } from "react";

import { runIngestion } from "@/app/(ops)/ingestion/actions";

/**
 * O09's table (PRD F17).
 *
 * One row per monitored source, and the four things an operator actually needs: when we
 * last looked, whether the page moved, whether that raised anything, and a way to look
 * again now.
 *
 * A failed run is shown in full, with the reason. The alternative — a row that simply looks
 * old — is how a source silently stops being monitored for six weeks.
 */
export type MonitoredSource = {
  id: string;
  name: string;
  tier: string;
  url: string | null;
  status: string;
  cadenceDays: number | null;
  lastJob: {
    id: string;
    kind: string;
    status: string;
    started_at: string | null;
    finished_at: string | null;
    error: string | null;
  } | null;
  lastCapture: {
    id: string;
    captured_at: string;
    content_hash: string | null;
    diff_from_previous: string | null;
  } | null;
  openCandidates: number;
};

export function IngestionRuns({ rows }: { rows: MonitoredSource[] }) {
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);

  function run(sourceId: string) {
    setProblem(null);
    setRunning(sourceId);

    startTransition(async () => {
      const result = await runIngestion({ sourceId });
      setRunning(null);

      if (!result.ok) {
        setProblem(result.error.message);
        return;
      }

      setOutcome((current) => ({ ...current, [sourceId]: describe(result.data) }));
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
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex flex-col gap-3 rounded-lg border border-border bg-bg-surface p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-h3">
                  <Link href={`/sources/${row.id}`} className="focus-ring underline">
                    {row.name}
                  </Link>
                </h2>
                <p className="text-caption text-text-secondary">
                  {row.tier.toUpperCase()} · every {row.cadenceDays ?? 1}{" "}
                  {(row.cadenceDays ?? 1) === 1 ? "day" : "days"}
                  {row.status === "paused" ? " · paused" : ""}
                </p>
                {row.url ? (
                  <p className="truncate text-caption text-text-tertiary">{row.url}</p>
                ) : (
                  <p className="text-caption text-status-tight">No URL, so nothing to fetch.</p>
                )}
              </div>

              <Button
                variant="secondary"
                onClick={() => run(row.id)}
                disabled={pending || !row.url}
              >
                {running === row.id ? "Looking…" : "Run now"}
              </Button>
            </div>

            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Fact label="Last looked">
                {row.lastCapture ? when(row.lastCapture.captured_at) : "Never"}
              </Fact>
              <Fact label="Last run">
                {row.lastJob ? (
                  <span
                    className={row.lastJob.status === "failed" ? "text-status-tight" : undefined}
                  >
                    {row.lastJob.status === "failed" ? "Could not read it" : "Read it"} ·{" "}
                    {row.lastJob.kind}
                  </span>
                ) : (
                  "Not run yet"
                )}
              </Fact>
              <Fact label="Waiting in Review">
                {row.openCandidates > 0 ? (
                  <Link href="/review" className="focus-ring underline">
                    {row.openCandidates} {row.openCandidates === 1 ? "candidate" : "candidates"}
                  </Link>
                ) : (
                  "None"
                )}
              </Fact>
            </dl>

            {/* Shown, not hidden: a source we cannot read is not a source we are watching. */}
            {row.lastJob?.error ? (
              <p className="text-body-sm text-status-tight">{row.lastJob.error}</p>
            ) : null}

            {outcome[row.id] ? (
              <p role="status" className="text-body-sm text-text-secondary">
                {outcome[row.id]}
              </p>
            ) : null}

            {row.lastCapture?.diff_from_previous ? (
              <details className="text-body-sm">
                <summary className="focus-ring cursor-pointer text-text-secondary">
                  What changed at the last capture
                </summary>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-bg-subtle p-3 text-caption">
                  {row.lastCapture.diff_from_previous}
                </pre>
              </details>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-caption text-text-secondary">{label}</dt>
      <dd className="text-body-sm">{children}</dd>
    </div>
  );
}

/** Plain sentences rather than counters — PRD §12.7 applies to Ops copy too. */
function describe(outcome: {
  status: string;
  unchanged: boolean;
  candidatesOpened: number;
  fieldsChecked: number;
  fieldsSkipped: number;
  error: string | null;
}): string {
  if (outcome.status === "failed") return outcome.error ?? "Could not read that source.";
  if (outcome.unchanged) return "Read it. The page is the same as last time.";

  const checked =
    outcome.fieldsSkipped > 0
      ? ` ${outcome.fieldsSkipped} of ${outcome.fieldsChecked} fields could not be checked — they have no recorded excerpt.`
      : "";

  return outcome.candidatesOpened > 0
    ? `The page changed, and ${outcome.candidatesOpened} ${
        outcome.candidatesOpened === 1 ? "field is" : "fields are"
      } now waiting in Review.${checked}`
    : `The page changed, but nothing a published field was verified against.${checked}`;
}

function when(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
