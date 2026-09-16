"use client";

import type { Cause, ChangeCard, DayHealth } from "@mandhira/journey-engine";
import { Button } from "@mandhira/ui/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@mandhira/ui/components/ui/sheet";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { engineText } from "../lib/engine-text";
import { ChangeSheet } from "./change-sheet";

/** PRD F5's five checks, in the order it lists them. */
const CHECKS: Cause["check"][] = [
  "time_load",
  "availability",
  "dependency",
  "physical_load",
  "return_guard",
];

export type DayHealthPanelProps = {
  journeyId: string;
  dayIndex: number;
  dayLabel: string;
  day: DayHealth;
  itemNames: Record<string, string>;
  timeZone: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * The sheet behind "See why" (A12), loaded on the first tap — see `day-health-sheet.tsx`.
 *
 * "Simplify this day" changes nothing. It asks the engine's option ladder for ways through
 * and shows them as a Change Card; the plan moves only when the traveler taps one (PRD F4,
 * PRD Principle 6).
 */
export function DayHealthPanel({
  journeyId,
  dayIndex,
  dayLabel,
  day,
  itemNames,
  timeZone,
  open,
  onOpenChange,
}: DayHealthPanelProps) {
  const t = useTranslations("healthSheet");
  const tAll = useTranslations();
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [asking, setAsking] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [change, setChange] = useState<{ id: string; card: ChangeCard } | null>(null);

  const load = day.timeLoadPct <= 80 ? "comfortable" : day.timeLoadPct <= 100 ? "full" : "over";
  const groups = CHECKS.map((check) => ({
    check,
    causes: day.causes.filter((cause) => cause.check === check),
  })).filter((group) => group.causes.length > 0);

  async function simplify() {
    setAsking(true);
    setNote(null);

    const response = await fetch(`/api/journeys/${journeyId}/changes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // Structural, with no delta: the engine judges the day exactly as it stands.
      body: JSON.stringify({ kind: "preferences_changed", dayIndex }),
    }).catch(() => null);

    const payload = response ? await response.json().catch(() => ({ ok: false })) : { ok: false };
    setAsking(false);

    if (!payload.ok) {
      setNote(t("not_available"));
      return;
    }

    const card = payload.data.card as ChangeCard;
    if (card.outcome === "no_impact") {
      setNote(t("fits"));
      return;
    }
    if (!card.recommended) {
      setNote(t("no_options"));
      return;
    }

    onOpenChange(false);
    // The traveler asked; that is what changed, whatever the stored trigger is called.
    setChange({
      id: payload.data.id as string,
      card: { ...card, whatChanged: { key: "healthSheet.simplify_what" } },
    });
  }

  async function decide(optionId: string | null) {
    if (!change) return;
    setDeciding(true);

    await fetch(`/api/journeys/${journeyId}/changes/${change.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ optionId }),
    }).catch(() => null);

    setDeciding(false);
    setChange(null);
    startTransition(() => router.refresh());
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-base">{t("title", { day: dayLabel })}</SheetTitle>
            <SheetDescription className="text-sm">
              {tAll(`health.day_state.${day.state}`)}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-5 px-4 pb-6">
            <section aria-labelledby={`load-${dayIndex}`} className="flex flex-col gap-1">
              <h3 id={`load-${dayIndex}`} className="text-sm font-medium">
                {t("checks.time_load")}
              </h3>
              <p className="text-sm">{t(`time_load.${load}`)}</p>
            </section>

            {groups.map(({ check, causes }) => (
              <section
                key={check}
                aria-labelledby={`check-${dayIndex}-${check}`}
                className="flex flex-col gap-1"
              >
                {check === "time_load" ? null : (
                  <h3 id={`check-${dayIndex}-${check}`} className="text-sm font-medium">
                    {t(`checks.${check}`)}
                  </h3>
                )}
                <ul className="flex flex-col gap-2">
                  {causes.map((cause, index) => (
                    <li key={`${cause.key}-${cause.itemId ?? index}`} className="text-sm">
                      {engineText(tAll, cause.key, cause.params)}
                      {cause.itemId && itemNames[cause.itemId] ? (
                        <span className="block text-muted-foreground">
                          {t("about_item", { item: itemNames[cause.itemId]! })}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ))}

            {day.trustExposure.length > 0 ? (
              <section aria-labelledby={`trust-${dayIndex}`} className="flex flex-col gap-1">
                <h3 id={`trust-${dayIndex}`} className="text-sm font-medium">
                  {t("trust_title")}
                </h3>
                <ul className="flex flex-col gap-2">
                  {day.trustExposure.map((cause) => (
                    <li key={cause.key} className="text-sm text-muted-foreground">
                      {engineText(tAll, cause.key, { count: cause.count })}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {groups.length === 0 && day.trustExposure.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("nothing")}</p>
            ) : null}

            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={asking}
                onClick={() => void simplify()}
                className="min-h-11 text-sm"
              >
                {t("simplify")}
              </Button>
              <p className="text-xs text-muted-foreground">{t("simplify_hint")}</p>
              <p role="status" className="text-sm">
                {asking ? t("simplifying") : note}
              </p>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {change ? (
        <ChangeSheet
          card={change.card}
          open
          pending={deciding || refreshing}
          itemName={(id) => itemNames[id]}
          timeZone={timeZone}
          onDecide={(optionId) => void decide(optionId)}
          onOpenChange={(next) => {
            // Closing without choosing is not a decision; the plan is untouched.
            if (!next) setChange(null);
          }}
        />
      ) : null}
    </>
  );
}
