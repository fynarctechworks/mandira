"use client";

import { Button } from "@mandhira/ui";
import Link from "next/link";
import { useState, useTransition } from "react";

import { decideCandidate } from "@/app/(ops)/review/actions";

/**
 * The Review queue's rows (PRD F18, PRD-OPS-WF-001).
 *
 * PRD F18 asks for four actions: accept, edit & accept, reject with reason, request
 * verification. Three of them are buttons. "Edit & accept" is a LINK, on purpose — the edit
 * belongs in the entity editor behind the publish gate, and putting a value field on this
 * card would make the queue a way to publish without validation or separation of duties.
 *
 * The proposed value is usually absent, and the card says so plainly rather than leaving a
 * blank column. Detection knows the evidence disappeared; it does not know what replaced
 * it, and guessing would be exactly the AI-writes-facts failure CLAUDE.md §5 forbids.
 */
export type CandidateRow = {
  id: string;
  entityTable: string;
  entityId: string | null;
  fieldName: string | null;
  excerpt: string | null;
  status: string;
  createdAt: string;
  decisionReason: string | null;
  proposed: string | null;
  sourceName: string | null;
  sourceTier: string | null;
  editorPath: string | null;
};

const ENTITY_LABEL: Record<string, string> = {
  destinations: "Destination",
  places: "Place",
  experiences: "Experience",
  routes: "Route",
  transport_connections: "Transport",
  availability_rules: "Availability",
};

const OUTCOME_LABEL: Record<string, string> = {
  done: "Accepted",
  rejected: "Rejected",
  in_progress: "Sent to Verify",
};

export function ReviewQueue({ rows }: { rows: CandidateRow[] }) {
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);

  function decide(id: string, decision: "accept" | "reject" | "request_verify") {
    setProblem(null);

    // Said here as well as in the database, so an operator learns it before the round trip
    // rather than from a refusal.
    if (decision === "reject" && !(reason[id] ?? "").trim()) {
      setProblem("Say why you are rejecting it, so the next person has your reasoning.");
      return;
    }

    startTransition(async () => {
      const result = await decideCandidate({
        id,
        decision,
        ...(reason[id]?.trim() ? { reason: reason[id]!.trim() } : {}),
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
          const decided = row.status !== "open";

          return (
            <li
              key={row.id}
              className="flex flex-col gap-3 rounded-lg border border-border bg-bg-surface p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-h3">
                    {ENTITY_LABEL[row.entityTable] ?? row.entityTable}
                    {row.fieldName ? ` · ${row.fieldName.replace(/_/g, " ")}` : ""}
                  </h2>
                  <p className="text-caption text-text-secondary">
                    {row.sourceName
                      ? `${row.sourceName}${row.sourceTier ? ` · ${row.sourceTier.toUpperCase()}` : ""}`
                      : "Source no longer registered"}{" "}
                    · noticed {when(row.createdAt)}
                  </p>
                </div>

                {decided ? (
                  <span className="text-body-sm text-text-secondary">
                    {OUTCOME_LABEL[row.status] ?? row.status}
                  </span>
                ) : null}
              </div>

              {/*
                PRD-OPS-SRC-004's acceptance names this: the excerpt, highlighted. It is
                the whole evidence for the candidate — the words that are no longer there.
              */}
              <div className="flex flex-col gap-1">
                <h3 className="text-caption text-text-secondary">
                  What the source used to say, and no longer does
                </h3>
                <blockquote className="rounded-lg border-l-4 border-brand-primary bg-bg-subtle px-3 py-2 text-body-sm">
                  {row.excerpt ?? "No excerpt was recorded when this field was verified."}
                </blockquote>
              </div>

              <div className="flex flex-col gap-1">
                <h3 className="text-caption text-text-secondary">What it says now</h3>
                <p className="text-body-sm">
                  {row.proposed ?? (
                    <span className="text-text-secondary">
                      Not proposed. We can tell the text disappeared, not what replaced it — open
                      the source to see, or send this to Verify so somebody checks.
                    </span>
                  )}
                </p>
              </div>

              {decided ? (
                row.decisionReason ? (
                  <p className="text-body-sm text-text-secondary">{row.decisionReason}</p>
                ) : null
              ) : (
                <div className="flex flex-col gap-2">
                  <label htmlFor={`reason-${row.id}`} className="text-caption text-text-secondary">
                    Reason (required to reject)
                  </label>
                  <textarea
                    id={`reason-${row.id}`}
                    rows={2}
                    maxLength={500}
                    value={reason[row.id] ?? ""}
                    onChange={(event) =>
                      setReason((current) => ({ ...current, [row.id]: event.target.value }))
                    }
                    className="focus-ring rounded-lg border border-border bg-bg-base p-2 text-body-sm"
                  />

                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => decide(row.id, "accept")} disabled={pending}>
                      Accept
                    </Button>

                    {/*
                      PRD F18's "edit & accept", as a link rather than a field. The edit
                      happens in the editor, behind the publish gate.
                    */}
                    {row.editorPath ? (
                      <Link
                        href={row.editorPath}
                        className="focus-ring inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-body-sm font-medium"
                      >
                        Open the editor
                      </Link>
                    ) : null}

                    <Button
                      variant="secondary"
                      onClick={() => decide(row.id, "request_verify")}
                      disabled={pending}
                    >
                      Send to Verify
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => decide(row.id, "reject")}
                      disabled={pending}
                    >
                      Reject
                    </Button>
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

function when(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
