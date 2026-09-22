"use client";

import { Button } from "@mandhira/ui";
import { checkItemAction, type PriorityTier } from "@mandhira/journey-engine";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
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
  preferredWindowStart,
  note,
  afterItemId,
  sameDay,
}: {
  journeyId: string;
  itemId: string;
  tier: PriorityTier;
  bufferMinutes: number;
  dayIndex: number;
  dayCount: number;
  /** HH:MM, or null when the traveler has no preference. */
  preferredWindowStart: string | null;
  note: string | null;
  /** The item this one is planned after, if any. */
  afterItemId: string | null;
  /** The other items on the same day, which this one could come after. */
  sameDay: { id: string; label: string }[];
}) {
  const t = useTranslations("itemActions");
  const tJourney = useTranslations("addToJourney");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  /*
   * Folded away until the traveler asks to edit (design review).
   *
   * Seven controls per stop filled a phone screen twice over, so a day of five stops could
   * not be read at all — and reading the day is what this page is for. Kept in React state
   * rather than left to the element: every save refreshes the server components, and a
   * traveler who had just set a note would otherwise watch the panel shut itself.
   */
  const [editing, setEditing] = useState(false);
  // Held until the traveler taps Save: nothing here changes the plan on blur or on typing.
  const [windowStart, setWindowStart] = useState(preferredWindowStart ?? "");
  const [noteText, setNoteText] = useState(note ?? "");
  const [after, setAfter] = useState(afterItemId ?? "");

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

  async function saveAfter() {
    setProblem(null);
    await respond(
      await fetch(`/api/journeys/${journeyId}/items/${itemId}/dependencies`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ afterItemId: after || null }),
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
    <details
      open={editing}
      onToggle={(event) => setEditing((event.currentTarget as HTMLDetailsElement).open)}
      className="border-t border-border pt-3"
    >
      <summary className="focus-ring flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-body-sm font-medium text-brand-primary-text [&::-webkit-details-marker]:hidden">
        <ChevronDown
          aria-hidden
          className={`size-4 transition-transform ${editing ? "rotate-180" : ""}`}
        />
        {t("edit_label")}
      </summary>

      <div className="flex flex-col gap-3 pt-3">
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`tier-${itemId}`}
            className="text-caption font-medium text-text-secondary"
          >
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
            <label
              htmlFor={`day-${itemId}`}
              className="text-caption font-medium text-text-secondary"
            >
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

        {canMove ? (
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`window-${itemId}`}
              className="text-caption font-medium text-text-secondary"
            >
              {t("window_label")}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id={`window-${itemId}`}
                type="time"
                value={windowStart}
                disabled={pending}
                onChange={(event) => setWindowStart(event.target.value)}
                className="min-h-11 rounded-lg border border-border bg-bg-surface px-3 text-body-sm"
              />
              <Button
                variant="secondary"
                disabled={pending || windowStart === (preferredWindowStart ?? "")}
                onClick={() =>
                  void send({ preferredWindowStart: windowStart || null, confirmed: true })
                }
              >
                {windowStart ? t("window_save") : t("window_clear")}
              </Button>
            </div>
            <p className="text-caption text-text-secondary">{t("window_hint")}</p>
          </div>
        ) : null}

        {sameDay.length > 0 ? (
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`after-${itemId}`}
              className="text-caption font-medium text-text-secondary"
            >
              {t("after_label")}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <select
                id={`after-${itemId}`}
                value={after}
                disabled={pending}
                onChange={(event) => setAfter(event.target.value)}
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-bg-surface px-3 text-body-sm"
              >
                <option value="">{t("after_none")}</option>
                {sameDay.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <Button
                variant="secondary"
                disabled={pending || after === (afterItemId ?? "")}
                onClick={() => void saveAfter()}
              >
                {t("after_save")}
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-1">
          <label
            htmlFor={`note-${itemId}`}
            className="text-caption font-medium text-text-secondary"
          >
            {t("note_label")}
          </label>
          <textarea
            id={`note-${itemId}`}
            value={noteText}
            maxLength={500}
            rows={2}
            disabled={pending}
            placeholder={t("note_placeholder")}
            onChange={(event) => setNoteText(event.target.value)}
            className="rounded-lg border border-border bg-bg-surface px-3 py-2 text-body-sm"
          />
          <Button
            variant="secondary"
            className="self-start"
            disabled={pending || noteText === (note ?? "")}
            onClick={() => void send({ note: noteText.trim() || null })}
          >
            {t("note_save")}
          </Button>
        </div>

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
            <Button
              variant="tertiary"
              onClick={() => setConfirmingRemove(true)}
              disabled={pending}
              className="self-start text-status-broken"
            >
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
    </details>
  );
}
