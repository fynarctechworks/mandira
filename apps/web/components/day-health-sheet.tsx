"use client";

import type { DayHealth } from "@mandhira/journey-engine";
import { cn } from "@mandhira/ui";
import { buttonVariants } from "@mandhira/ui/components/ui/button";
import { Info } from "lucide-react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useState } from "react";

/*
 * The sheet and the Change Card it can raise load on the first tap, not with the journey page.
 * Both are only ever reached through this button, and carrying them in the first load put the
 * page over TRD-PERF-001's 180 kB.
 */
const DayHealthPanel = dynamic(
  () => import("./day-health-panel").then((module) => module.DayHealthPanel),
  { ssr: false },
);

/**
 * Why a day is in the state it is in (PRD F5, A12).
 *
 * Every cause, grouped by the check that raised it, in plain language — and never a number:
 * PRD F5 forbids a score, so time load is said as room, nearly full, or over.
 *
 * Each opening mounts a fresh panel (`key`), so a note from last time is never shown as if it
 * were about the day as it stands now.
 */
export function DayHealthSheet(props: {
  journeyId: string;
  dayIndex: number;
  dayLabel: string;
  day: DayHealth;
  itemNames: Record<string, string>;
  timeZone: string;
}) {
  const t = useTranslations("healthSheet");
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);

  return (
    <>
      <button
        type="button"
        className={cn(buttonVariants({ variant: "ghost" }), "min-h-11 gap-1.5 px-2 text-sm")}
        aria-label={t("open_named", { day: props.dayLabel })}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setSession((count) => count + 1);
          setOpen(true);
        }}
      >
        <Info className="size-4" aria-hidden />
        {t("open")}
      </button>

      {session > 0 ? (
        <DayHealthPanel key={session} {...props} open={open} onOpenChange={setOpen} />
      ) : null}
    </>
  );
}
