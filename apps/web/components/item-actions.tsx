"use client";

import { Button } from "@mandhira/ui";
import { checkItemAction, type PriorityTier } from "@mandhira/journey-engine";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const TIERS: { value: PriorityTier; label: string; help: string }[] = [
  { value: "fixed", label: "Fixed", help: "A set time. Never moved or removed." },
  { value: "protected", label: "Must do", help: "Never removed. Moved only if you say so." },
  { value: "important", label: "Important", help: "May be moved, if you agree." },
  { value: "optional", label: "Optional", help: "The first thing offered up when time is short." },
];

/**
 * The item editor (PRD-PLAN-003).
 *
 * Every control here maps to one action the API also checks. The UI asks
 * `checkItemAction` so a forbidden action is not offered — but the route asks it too, and
 * the route is the control: hiding a button has never been one (CLAUDE.md §4).
 *
 * Every change is an explicit tap, and the destructive ones send `confirmed` only after the
 * traveler has confirmed THIS change (PRD Principle 6). Nothing is applied on blur, on
 * change, or optimistically — a plan that shifts under someone is not a plan they own.
 */
export function ItemActions({
  journeyId,
  itemId,
  tier,
  bufferMinutes,
  dayIndex,
  dayCount,
}: {
  journeyId: string;
  itemId: string;
  tier: PriorityTier;
  bufferMinutes: number;
  dayIndex: number;
  dayCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const canRemove = checkItemAction(tier, "remove").allowed;
  const canMove = checkItemAction(tier, "move").allowed;

  async function send(body: Record<string, unknown>, method: "PATCH" | "DELETE" = "PATCH") {
    setProblem(null);

    const response = await fetch(`/api/journeys/${journeyId}/items/${itemId}`, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    const payload = await response.json();

    if (!payload.ok) {
      // The route's own sentence, not a generic apology — it says which rule refused and
      // what the traveler could do instead.
      setProblem(payload.error?.message ?? "That didn't go through.");
      return;
    }

    // Re-render from the server so the timeline and the health verdict move together.
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={`tier-${itemId}`} className="text-caption font-medium text-text-secondary">
          How much this matters
        </label>
        <select
          id={`tier-${itemId}`}
          defaultValue={tier}
          disabled={pending}
          onChange={(event) => void send({ tier: event.target.value })}
          className="min-h-11 rounded-lg border border-border bg-bg-surface px-3 text-body-sm"
        >
          {TIERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label} — {option.help}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor={`buffer-${itemId}`}
          className="text-caption font-medium text-text-secondary"
        >
          Time to leave before this
        </label>
        {/*
         * PRD-PLAN-005: buffers are visible AND editable — including on a fixed item. The
         * anchor does not move, but how much room you leave to reach it is your call.
         */}
        <select
          id={`buffer-${itemId}`}
          defaultValue={String(bufferMinutes)}
          disabled={pending}
          onChange={(event) => void send({ bufferMinutes: Number(event.target.value) })}
          className="min-h-11 rounded-lg border border-border bg-bg-surface px-3 text-body-sm"
        >
          {[0, 10, 15, 20, 30, 45, 60].map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes === 0 ? "No gap" : `${minutes} minutes`}
            </option>
          ))}
        </select>
      </div>

      {canMove && dayCount > 1 ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={`day-${itemId}`} className="text-caption font-medium text-text-secondary">
            Move to another day
          </label>
          <select
            id={`day-${itemId}`}
            defaultValue={String(dayIndex)}
            disabled={pending}
            onChange={(event) =>
              void send({ dayIndex: Number(event.target.value), confirmed: true })
            }
            className="min-h-11 rounded-lg border border-border bg-bg-surface px-3 text-body-sm"
          >
            {Array.from({ length: dayCount }, (_, index) => (
              <option key={index} value={index}>
                Day {index + 1}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {canRemove ? (
        confirmingRemove ? (
          <div
            role="group"
            aria-label="Confirm removing this"
            className="flex flex-col gap-2 rounded-lg border border-status-broken p-3"
          >
            <p className="text-body-sm">Take this out of the journey?</p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setConfirmingRemove(false)}
                disabled={pending}
              >
                Keep it
              </Button>
              <Button onClick={() => void send({ confirmed: true }, "DELETE")} disabled={pending}>
                Remove it
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setConfirmingRemove(true)} disabled={pending}>
            Remove this
          </Button>
        )
      ) : (
        /*
         * Said, not hidden. A traveler who cannot remove something should know it is
         * because of what they told Mandhira, and that they can change that.
         */
        <p className="text-caption text-text-secondary">
          {tier === "fixed"
            ? "This has a set time, so it can't be removed. Change how much it matters if that's no longer true."
            : "You marked this as something you must do, so Mandhira won't remove it."}
        </p>
      )}

      {problem ? (
        <p role="alert" className="text-body-sm text-status-broken">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
