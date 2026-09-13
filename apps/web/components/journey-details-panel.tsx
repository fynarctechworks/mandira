"use client";

import { Button } from "@mandhira/ui/components/ui/button";
import { Field, FieldLabel } from "@mandhira/ui/components/ui/field";
import { Input } from "@mandhira/ui/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@mandhira/ui/components/ui/native-select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@mandhira/ui/components/ui/sheet";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

type Pace = "relaxed" | "balanced" | "full";

export type JourneyDetails = {
  title: string | null;
  startDate: string | null;
  endDate: string | null;
  dayStartTime: string;
  dayEndTime: string;
  pace: Pace;
};

export type JourneyDetailsPanelProps = {
  journeyId: string;
  initial: JourneyDetails;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * The sheet behind "Edit details", loaded on the first tap — see `journey-details-sheet.tsx`.
 *
 * Only what changed is sent, and nothing is sent until Save is tapped. The route decides
 * whether the edit fits what is already planned and says so in its own words when it does not.
 */
export function JourneyDetailsPanel({
  journeyId,
  initial,
  open,
  onOpenChange,
}: JourneyDetailsPanelProps) {
  const t = useTranslations("journeyEdit");
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [values, setValues] = useState(initial);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const set = <K extends keyof JourneyDetails>(key: K, value: JourneyDetails[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  async function save() {
    const changed = Object.fromEntries(
      (Object.keys(values) as (keyof JourneyDetails)[])
        .filter((key) => values[key] !== initial[key])
        .map((key) => [key, key === "title" ? values.title?.trim() || null : values[key]]),
    );

    if (Object.keys(changed).length === 0) {
      onOpenChange(false);
      return;
    }

    setPending(true);
    setProblem(null);

    const response = await fetch(`/api/journeys/${journeyId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(changed),
    }).catch(() => null);

    const payload = response ? await response.json().catch(() => ({ ok: false })) : { ok: false };
    setPending(false);

    if (!payload.ok) {
      setProblem(payload.error?.message ?? t("not_saved"));
      return;
    }

    onOpenChange(false);
    startTransition(() => router.refresh());
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">{t("title")}</SheetTitle>
        </SheetHeader>

        <form
          className="flex flex-col gap-4 px-4 pb-6"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Field>
            <FieldLabel htmlFor="journey-title" className="text-sm">
              {t("name")}
            </FieldLabel>
            <Input
              id="journey-title"
              value={values.title ?? ""}
              maxLength={120}
              onChange={(event) => set("title", event.target.value)}
              className="h-11 text-sm"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="journey-start" className="text-sm">
                {t("start_date")}
              </FieldLabel>
              <Input
                id="journey-start"
                type="date"
                value={values.startDate ?? ""}
                onChange={(event) => set("startDate", event.target.value || null)}
                className="h-11 text-sm"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="journey-end" className="text-sm">
                {t("end_date")}
              </FieldLabel>
              <Input
                id="journey-end"
                type="date"
                value={values.endDate ?? ""}
                onChange={(event) => set("endDate", event.target.value || null)}
                className="h-11 text-sm"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="journey-day-start" className="text-sm">
                {t("day_start")}
              </FieldLabel>
              <Input
                id="journey-day-start"
                type="time"
                value={values.dayStartTime}
                onChange={(event) => set("dayStartTime", event.target.value)}
                className="h-11 text-sm"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="journey-day-end" className="text-sm">
                {t("day_end")}
              </FieldLabel>
              <Input
                id="journey-day-end"
                type="time"
                value={values.dayEndTime}
                onChange={(event) => set("dayEndTime", event.target.value)}
                className="h-11 text-sm"
              />
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="journey-pace" className="text-sm">
              {t("pace")}
            </FieldLabel>
            <NativeSelect
              id="journey-pace"
              value={values.pace}
              onChange={(event) => set("pace", event.target.value as Pace)}
              className="w-full [&_select]:h-11 [&_select]:text-sm"
            >
              {(["relaxed", "balanced", "full"] as const).map((pace) => (
                <NativeSelectOption key={pace} value={pace}>
                  {t(`pace_options.${pace}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>

          {problem ? (
            <p role="alert" className="text-sm text-destructive">
              {problem}
            </p>
          ) : null}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 flex-1 text-sm"
              onClick={() => onOpenChange(false)}
            >
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={pending || refreshing}
              className="min-h-11 flex-1 text-sm"
            >
              {pending ? t("saving") : t("save")}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
