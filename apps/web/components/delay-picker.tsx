"use client";

import { BottomSheet, Button } from "@mandhira/ui";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

/**
 * How late, or how much longer (PRD F6's trigger table).
 *
 * "User taps 'I'm running late' on NOW and picks +15 / +30 / +60 / custom." The first
 * version skipped the picking: "Running late" fired at once with fifteen minutes, so a
 * traveler forty-five minutes behind was shown options computed for fifteen — a card that
 * said the evening aarti was still reachable when it was not. The number is the whole
 * input to the engine, and the only person who knows it is the traveler.
 *
 * A sheet rather than more buttons on the card, because PRD F8 allows the NOW card three
 * actions and no more. The three stay; this is what one of them opens.
 *
 * Custom is capped at four hours, which is what `/api/journeys/:id/changes` accepts. A
 * traveler four hours behind has a different day, not a later one, and "Simplify this
 * day" is the tool for that.
 */
const PRESETS = [15, 30, 60] as const;
const MAX_MINUTES = 240;

export function DelayPicker({
  open,
  onOpenChange,
  kind,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: "running_late" | "stay_longer";
  onPick: (minutes: number) => void;
}) {
  const t = useTranslations("delayPicker");
  const inputId = useId();
  const [custom, setCustom] = useState("");

  const customMinutes = Number(custom);
  const customValid =
    custom.trim() !== "" &&
    Number.isInteger(customMinutes) &&
    customMinutes > 0 &&
    customMinutes <= MAX_MINUTES;

  function pick(minutes: number) {
    onOpenChange(false);
    setCustom("");
    onPick(minutes);
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t(kind === "running_late" ? "late_title" : "longer_title")}
      description={t(kind === "running_late" ? "late_hint" : "longer_hint")}
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2" role="group" aria-label={t("presets_label")}>
          {PRESETS.map((minutes) => (
            <Button
              key={minutes}
              type="button"
              variant="secondary"
              className="min-h-12"
              onClick={() => pick(minutes)}
            >
              {t("plus_minutes", { minutes })}
            </Button>
          ))}
        </div>

        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (customValid) pick(customMinutes);
          }}
        >
          <label htmlFor={inputId} className="text-body-sm font-medium">
            {t("custom_label")}
          </label>
          <div className="flex gap-2">
            <input
              id={inputId}
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_MINUTES}
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              className="min-h-11 w-full rounded-lg border border-border bg-bg-surface px-3 text-body"
              aria-describedby={`${inputId}-hint`}
            />
            <Button type="submit" disabled={!customValid}>
              {t("custom_submit")}
            </Button>
          </div>
          <p id={`${inputId}-hint`} className="text-caption text-text-secondary">
            {t("custom_hint", { max: MAX_MINUTES })}
          </p>
        </form>
      </div>
    </BottomSheet>
  );
}
