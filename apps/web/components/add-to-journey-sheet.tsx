"use client";

import type { HealthReport } from "@mandhira/journey-engine";
import { cn } from "@mandhira/ui";
import { Button, buttonVariants } from "@mandhira/ui/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@mandhira/ui/components/ui/field";
import { Input } from "@mandhira/ui/components/ui/input";
import { Label } from "@mandhira/ui/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@mandhira/ui/components/ui/native-select";
import { RadioGroup, RadioGroupItem } from "@mandhira/ui/components/ui/radio-group";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@mandhira/ui/components/ui/sheet";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

type Tier = "protected" | "important" | "optional" | "fixed";

const TIERS: Tier[] = ["protected", "important", "optional", "fixed"];

export type JourneyChoice = { id: string; title: string; dayLabels: string[] };

export type AddToJourneySheetProps = {
  experienceId: string;
  experienceName: string;
  journeys: JourneyChoice[];
  planHref: string;
  locale: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * The sheet behind "Add to journey" (PRD-DISC-004), loaded on the first tap — see
 * `add-to-journey.tsx` for why it is split.
 *
 * The traveler picks the journey, the day and how much it matters, and only the final tap
 * adds it (PRD Principle 6). IMPORTANT is preselected, as PRD F2 sets; FIXED asks for its time,
 * because a fixed item without a time is not fixed. The route re-checks all of it.
 */
export function AddToJourneySheet({
  experienceId,
  experienceName,
  journeys,
  planHref,
  locale,
  open,
  onOpenChange,
}: AddToJourneySheetProps) {
  const t = useTranslations("addToJourney");
  const tHealth = useTranslations("health");
  const [journeyId, setJourneyId] = useState(journeys[0]?.id ?? "");
  const [dayIndex, setDayIndex] = useState(0);
  const [tier, setTier] = useState<Tier>("important");
  const [time, setTime] = useState("");
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [added, setAdded] = useState<{
    journeyId: string;
    /** Which day it went on, so "Open the journey" lands on that day's tab (A10). */
    dayIndex: number;
    health: HealthReport | null;
  } | null>(null);

  const chosen = journeys.find((journey) => journey.id === journeyId);

  async function add() {
    setPending(true);
    setProblem(null);

    const response = await fetch(`/api/journeys/${journeyId}/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        experienceId,
        dayIndex,
        tier,
        ...(tier === "fixed" ? { fixedStartTime: time } : {}),
      }),
    }).catch(() => null);

    const payload = response ? await response.json().catch(() => ({ ok: false })) : { ok: false };

    if (payload.ok) {
      setAdded({ journeyId, dayIndex, health: payload.data.health ?? null });
    } else {
      setProblem(payload.error?.message ?? t("not_added"));
    }
    setPending(false);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setAdded(null);
      }}
    >
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">{t("title")}</SheetTitle>
          <SheetDescription className="text-sm">
            {t("description", { name: experienceName })}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-4 pb-6">
          {added ? (
            <div role="status" className="flex flex-col gap-3">
              <p className="text-sm font-medium">{t("added")}</p>
              {added.health ? (
                <p className="text-sm text-muted-foreground">
                  {tHealth(`state.${added.health.journeyState}`)}
                </p>
              ) : null}
              <Link
                /*
                  To the day it was added to. With day tabs (A10), opening the journey on
                  day one after adding something to day two would show the traveler
                  everything except the thing they just added.
                */
                href={`/${locale}/journeys/${added.journeyId}#day-${added.dayIndex}`}
                className={cn(buttonVariants({ variant: "outline" }), "min-h-11 text-sm")}
              >
                {t("open_journey")}
              </Link>
            </div>
          ) : journeys.length === 0 ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">{t("no_journeys")}</p>
              <Link
                href={planHref}
                className={cn(buttonVariants(), "min-h-11 w-full gap-2 text-sm")}
              >
                {t("plan_new")}
              </Link>
            </div>
          ) : (
            <form
              className="flex flex-col gap-5"
              onSubmit={(event) => {
                event.preventDefault();
                void add();
              }}
            >
              <FieldSet>
                <FieldLegend className="text-sm">{t("journey")}</FieldLegend>
                <RadioGroup
                  value={journeyId}
                  onValueChange={(value) => {
                    setJourneyId(value as string);
                    setDayIndex(0);
                  }}
                  className="gap-0"
                >
                  {journeys.map((journey) => (
                    <Label key={journey.id} className="min-h-11 gap-3 text-sm font-normal">
                      <RadioGroupItem value={journey.id} />
                      {journey.title}
                    </Label>
                  ))}
                </RadioGroup>
                <Link
                  href={planHref}
                  className="flex min-h-11 items-center self-start text-sm font-medium text-primary-text underline-offset-4 hover:underline"
                >
                  {t("plan_new")}
                </Link>
              </FieldSet>

              <Field>
                <FieldLabel htmlFor="add-day" className="text-sm">
                  {t("day")}
                </FieldLabel>
                <NativeSelect
                  id="add-day"
                  value={String(dayIndex)}
                  onChange={(event) => setDayIndex(Number(event.target.value))}
                  className="w-full [&_select]:h-11 [&_select]:text-sm"
                >
                  {(chosen?.dayLabels ?? []).map((label, index) => (
                    <NativeSelectOption key={label} value={String(index)}>
                      {label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>

              <FieldSet>
                <FieldLegend className="text-sm">{t("tier")}</FieldLegend>
                <RadioGroup
                  value={tier}
                  onValueChange={(value) => setTier(value as Tier)}
                  className="gap-0"
                >
                  {TIERS.map((value) => (
                    <Label key={value} className="min-h-11 gap-3 text-sm font-normal">
                      <RadioGroupItem value={value} />
                      {t(`tiers.${value}`)}
                    </Label>
                  ))}
                </RadioGroup>
              </FieldSet>

              {tier === "fixed" ? (
                <Field>
                  <FieldLabel htmlFor="add-time" className="text-sm">
                    {t("time")}
                  </FieldLabel>
                  <Input
                    id="add-time"
                    type="time"
                    required
                    value={time}
                    onChange={(event) => setTime(event.target.value)}
                    className="h-11 text-sm"
                  />
                  <FieldDescription>{t("time_hint")}</FieldDescription>
                </Field>
              ) : null}

              {problem ? (
                <p role="alert" className="text-sm text-destructive">
                  {problem}
                </p>
              ) : null}

              <Button
                type="submit"
                disabled={pending || !journeyId || (tier === "fixed" && !time)}
                className="min-h-11 text-sm"
              >
                {pending ? t("adding") : t("add")}
              </Button>
            </form>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
