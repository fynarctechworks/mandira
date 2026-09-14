"use client";

import { Button } from "@mandhira/ui";
import { useState, useTransition } from "react";

import Link from "next/link";
import { resolveReport, triageReport } from "@/app/(ops)/reports/actions";
import { editorPath, entityNoun } from "@/lib/entities";

/*
 * Pinned locale and zone. `toLocaleDateString()` used the server's defaults on the server
 * and the operator's in the browser, so the two renders disagreed and React discarded the
 * server HTML (hydration error #418 on /reports).
 */
const FILED = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});
/**
 * The Reports queue (PRD F14, PRD-OPS-WF-005).
 *
 * Three outcomes and no fourth. PRD-REPT-003 names them exactly — Updated, Confirmed as
 * correct, Couldn't verify — and "couldn't verify" is a real answer that has to be as easy
 * to record as the other two. A queue that only offers success is a queue where the hard
 * ones sit forever.
 */
export type ReportRow = {
  id: string;
  report_type: string;
  entity_table: string;
  entity_id: string;
  field_name: string | null;
  description: string | null;
  status: string;
  locale: string | null;
  created_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
  notified_user: boolean;
  media_id: string | null;
  /**
   * A 15-minute signed URL made on the server (lib/report-photos). Null when there is no
   * photo, or when there is one that could not be signed — `media_id` tells them apart.
   */
  photoUrl: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  timing_changed: "Times are different",
  closed: "Closed",
  accessibility_issue: "Access harder than described",
  wrong_information: "Something is wrong",
  outdated_guidance: "Advice out of date",
  other: "Something else",
};

const OUTCOMES = [
  { value: "resolved_updated", label: "Updated" },
  { value: "resolved_confirmed_correct", label: "Confirmed as correct" },
  { value: "resolved_unverifiable", label: "Couldn't verify" },
] as const;

/** A report's state in words. */
const STATUS_LABEL: Record<string, string> = {
  new: "New",
  triaged: "Sent to Verify",
  closed: "Closed",
  ...Object.fromEntries(OUTCOMES.map((outcome) => [outcome.value, outcome.label])),
};

export function ReportsQueue({ rows }: { rows: ReportRow[] }) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);

  function resolve(id: string, status: (typeof OUTCOMES)[number]["value"]) {
    setProblem(null);
    startTransition(async () => {
      const result = await resolveReport({ id, status, note: note[id] ?? undefined });
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
          const resolved = row.status.startsWith("resolved") || row.status === "closed";

          return (
            <li
              key={row.id}
              className="flex flex-col gap-3 rounded-lg border border-border bg-bg-surface p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-h3">{TYPE_LABEL[row.report_type] ?? row.report_type}</h2>
                  <p className="text-caption text-text-secondary">
                    {entityNoun(row.entity_table)}
                    {row.field_name ? ` · ${row.field_name}` : ""} ·{" "}
                    {FILED.format(new Date(row.created_at))}
                    {row.locale ? ` · ${row.locale}` : ""}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-caption">
                  {STATUS_LABEL[row.status] ?? row.status}
                </span>
              </div>

              {editorPath(row.entity_table, row.entity_id) ? (
                <Link
                  href={editorPath(row.entity_table, row.entity_id)!}
                  className="focus-ring self-start text-body-sm font-medium text-brand-primary-text underline"
                >
                  Open the record this is about
                </Link>
              ) : null}

              {row.description ? (
                /*
                 * Free text a traveler typed, rendered as text and never as markup. It is
                 * the only user-authored content that reaches an operator's screen.
                 */
                <p className="text-body-sm">{row.description}</p>
              ) : (
                <p className="text-body-sm text-text-tertiary">No description given.</p>
              )}

              {row.media_id ? (
                row.photoUrl ? (
                  <figure className="flex flex-col gap-1">
                    <a
                      href={row.photoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="focus-ring self-start"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL from a private bucket; next/image would cache it */}
                      <img
                        src={row.photoUrl}
                        alt="Photo sent with this report"
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        className="max-h-64 w-auto max-w-full rounded-lg border border-border object-contain"
                      />
                    </a>
                    <figcaption className="text-caption text-text-secondary">
                      Photo from the reporter. Select it to open full size. The link lasts 15
                      minutes — refresh the page for a new one.
                    </figcaption>
                  </figure>
                ) : (
                  <p className="text-body-sm text-status-tight">
                    This report has a photo, but it didn&apos;t load. Refresh the page to try again.
                  </p>
                )
              ) : null}

              {resolved ? (
                <p className="text-body-sm text-text-secondary">
                  {row.resolution_note ? `“${row.resolution_note}” · ` : ""}
                  {/* Whether the reporter has an account is not readable by Ops (0030 withholds
                      user_id), so this says only what is known. */}
                  {row.notified_user
                    ? "The reporter has been told."
                    : "The reporter has not been told."}
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  <label htmlFor={`note-${row.id}`} className="text-body-sm font-medium">
                    What did you find? (optional, and the reporter does not see it)
                  </label>
                  <input
                    id={`note-${row.id}`}
                    value={note[row.id] ?? ""}
                    maxLength={500}
                    onChange={(event) =>
                      setNote((current) => ({ ...current, [row.id]: event.target.value }))
                    }
                    className="focus-ring min-h-11 rounded-lg border border-border px-3 text-body-sm"
                  />

                  <div className="flex flex-wrap gap-2">
                    {OUTCOMES.map((outcome) => (
                      <Button
                        key={outcome.value}
                        variant="secondary"
                        disabled={pending}
                        onClick={() => resolve(row.id, outcome.value)}
                      >
                        {outcome.label}
                      </Button>
                    ))}

                    {row.status === "new" ? (
                      <Button
                        variant="tertiary"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            setProblem(null);
                            const result = await triageReport({ id: row.id });
                            if (!result.ok) setProblem(result.error.message);
                          })
                        }
                      >
                        Send to Verify
                      </Button>
                    ) : null}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
