"use client";

import { Button } from "@mandhira/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { publishEntity, returnToDraft, submitForReview } from "@/app/(ops)/publish/actions";

export type ValidationProblem = { field: string; message: string };

/** Aggregate only — see `affected_journey_count`. No identifier reaches this component. */
export type JourneyImpact = {
  active: number;
  upcoming: number;
  total: number;
  first_start_date: string | null;
};

const FIELD_LABEL: Record<string, string> = {
  opening_schedule: "Opening hours",
  closure_rules_i18n: "Closure rules",
  entry_requirements_i18n: "Entry requirements",
  advance_booking_required: "Advance booking required",
  advance_booking_how_i18n: "How to book",
  duration_likely_minutes: "Usual duration",
  name_i18n: "Name",
  location: "Location",
  availability: "Availability",
  media: "Media",
  conflict: "Conflict",
  entity: "This record",
};

/**
 * Submit / approve / publish controls for one entity (O13, PRD-OPS-WF-004).
 *
 * Blocking problems are listed by field, because PRD F18's acceptance is that a refused
 * publish names what is at fault. The list comes from the same SQL function the gate
 * enforces, so this can never claim an entity is ready when the database disagrees.
 */
export function PublishPanel({
  entityTable,
  entityId,
  status,
  problems,
  impact,
}: {
  entityTable: string;
  entityId: string;
  status: string;
  problems: ValidationProblem[];
  impact?: JourneyImpact | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"submit" | "publish" | "return" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const ready = problems.length === 0;

  async function run(
    kind: "submit" | "publish" | "return",
    action: typeof submitForReview | typeof publishEntity | typeof returnToDraft,
  ) {
    setBusy(kind);
    setMessage(null);

    const result = await action({ entity_table: entityTable, entity_id: entityId });
    setBusy(null);

    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    router.refresh();
  }

  return (
    <section
      aria-label="Publishing"
      className="flex flex-col gap-3 rounded-card border border-border-subtle bg-surface p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-h3">Publishing</h2>
          <p className="mt-1 text-body-sm text-text-secondary">
            Currently <strong className="text-text-primary">{status.replace(/_/g, " ")}</strong>.
            {status === "published"
              ? " Travelers can see this."
              : " Travelers cannot see this yet."}
          </p>
        </div>
      </div>

      {ready ? (
        <p className="text-body-sm text-status-comfortable">● Nothing is blocking publication.</p>
      ) : (
        <div>
          <p className="text-body-sm text-status-tight">
            ○ {problems.length} thing{problems.length === 1 ? "" : "s"} still to sort out:
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {problems.map((problem) => (
              <li key={`${problem.field}:${problem.message}`} className="text-body-sm">
                <strong className="font-medium">
                  {FIELD_LABEL[problem.field] ?? problem.field}
                </strong>{" "}
                — {problem.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/*
        PRD-OPS-WF-007: the count and the wording, BEFORE the button rather than after it.
        An approver about to interrupt two hundred people mid-journey should know that
        while they can still decide not to, and afterwards is not a decision point.

        Numbers only. `affected_journey_count` is a security definer function returning
        aggregates — no journey, no traveler, no item crosses into Ops (CLAUDE.md §5).
      */}
      {impact && status !== "published" ? (
        <div className="flex flex-col gap-1 rounded-lg border border-border-subtle bg-bg-subtle p-3">
          <h3 className="text-body-sm font-medium">Who this reaches</h3>
          {impact.total === 0 ? (
            <p className="text-body-sm text-text-secondary">
              No live journey includes this yet, so publishing interrupts nobody.
            </p>
          ) : (
            <>
              <p className="text-body-sm">
                {impact.total} live {impact.total === 1 ? "journey has" : "journeys have"} this in
                the plan
                {impact.active > 0
                  ? ` — ${impact.active} of them ${impact.active === 1 ? "is" : "are"} under way now`
                  : ""}
                .
              </p>
              <p className="text-caption text-text-secondary">
                Each of those travelers will be shown a card saying what changed and offering
                options. Nothing moves in anybody&apos;s plan until they choose.
              </p>
            </>
          )}
        </div>
      ) : null}

      {message ? (
        <p role="alert" className="text-body-sm text-status-tight">
          {message}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {status === "draft" ? (
          <Button
            type="button"
            variant="secondary"
            loading={busy === "submit"}
            onClick={() => void run("submit", submitForReview)}
          >
            Submit for review
          </Button>
        ) : null}

        {status === "in_review" ? (
          <>
            <Button
              type="button"
              loading={busy === "publish"}
              disabled={!ready}
              onClick={() => void run("publish", publishEntity)}
            >
              Approve and publish
            </Button>
            <Button
              type="button"
              variant="tertiary"
              loading={busy === "return"}
              onClick={() => void run("return", returnToDraft)}
            >
              Send back to draft
            </Button>
          </>
        ) : null}
      </div>

      <p className="text-caption text-text-secondary">
        Publishing needs the approver role, and cannot be done by whoever made the last change —
        that separation is the point.
      </p>
    </section>
  );
}
