"use client";

import { Button } from "@mandhira/ui";
import { checkItemAction, type PriorityTier } from "@mandhira/journey-engine";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

const TIERS: PriorityTier[] = ["fixed", "protected", "important", "optional"];

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
  const t = useTranslations("itemActions");
  const tJourney = useTranslations("addToJourney");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const canRemove = checkItemAction(tier, "remove").allowed;
  const canMove = checkItemAction(tier, "move").allowed;

  async function send(body: Record<string, unknown>) {
    setProblem(null);
    await respond(
      await fetch(`/api/journeys/${journeyId}/items/${itemId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  }

  /*
   * A DELETE carries its input in the query string — `withApi` reads nothing else for it —
   * so the confirmation goes there. Sent as a body it never arrived, and every removal was
   * refused as unconfirmed.
   */
  async function remove() {
    setProblem(null);
    await respond(
      await fetch(`/api/journeys/${journeyId}/items/${itemId}?confirmed=true`, {
        method: "DELETE",
      }),
    );
  }

  async function respond(response: Response) {
    const payload = await response.json();

    if (!payload.ok) {
      // The route's own sentence, not a generic apology — it says which rule refused and
      // what the traveler could do instead.
      setProblem(payload.error?.message ?? t("not_through"));
      return;
    }

    // Re-render from the server so the timeline and the health verdict move together.
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={`tier-${itemId}`} className="text-caption font-medium text-text-secondary">
          {t("tier_label")}
        </label>
        <select
          id={`tier-${itemId}`}
          defaultValue={tier}
          disabled={pending}
          onChange={(event) => void send({ tier: event.target.value })}
          className="min-h-11 rounded-lg border border-border bg-bg-surface px-3 text-body-sm"
        >
          {TIERS.map((option) => (
            <option key={option} value={option}>
              {t(`tiers.${option}.label`)} — {t(`tiers.${option}.help`)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor={`buffer-${itemId}`}
          className="text-caption font-medium text-text-secondary"
        >
          {t("buffer_label")}
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
              {minutes === 0 ? t("no_gap") : t("buffer_minutes", { minutes })}
            </option>
          ))}
        </select>
      </div>

      {canMove && dayCount > 1 ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={`day-${itemId}`} className="text-caption font-medium text-text-secondary">
            {t("move_label")}
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
                {tJourney("day_option", { day: index + 1 })}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {canRemove ? (
        confirmingRemove ? (
          <div
            role="group"
            aria-label={t("confirm_label")}
            className="flex flex-col gap-2 rounded-lg border border-status-broken p-3"
          >
            <p className="text-body-sm">{t("confirm_question")}</p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setConfirmingRemove(false)}
                disabled={pending}
              >
                {t("keep")}
              </Button>
              <Button onClick={() => void remove()} disabled={pending}>
                {t("remove_confirm")}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setConfirmingRemove(true)} disabled={pending}>
            {t("remove")}
          </Button>
        )
      ) : (
        /*
         * Said, not hidden. A traveler who cannot remove something should know it is
         * because of what they told Mandhira, and that they can change that.
         */
        <p className="text-caption text-text-secondary">
          {tier === "fixed" ? t("fixed_locked") : t("protected_locked")}
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
