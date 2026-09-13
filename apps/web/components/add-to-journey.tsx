"use client";

import { cn } from "@mandhira/ui";
import { buttonVariants } from "@mandhira/ui/components/ui/button";
import { Plus } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import type { JourneyChoice } from "./add-to-journey-sheet";

export type { JourneyChoice } from "./add-to-journey-sheet";

/*
 * The sheet — Base UI's dialog and radio group, and the form — loads on the first tap rather
 * than with the page. Nothing in it is needed before that tap, and carrying it in the first
 * load put the experience page over TRD-PERF-001's 180 kB.
 */
const AddToJourneySheet = dynamic(
  () => import("./add-to-journey-sheet").then((module) => module.AddToJourneySheet),
  { ssr: false },
);

/**
 * "Add to journey" (PRD F2, PRD-DISC-004) — how discovery reaches the planner.
 *
 * A signed-out visitor is sent to sign in with the way back; everyone else opens the sheet,
 * where the journey, the day and the tier are chosen and only the final tap adds anything.
 */
export function AddToJourney({
  experienceId,
  experienceName,
  journeys,
  planHref,
  signInHref,
  locale,
}: {
  experienceId: string;
  experienceName: string;
  journeys: JourneyChoice[];
  planHref: string;
  /** Set when the visitor is signed out. */
  signInHref: string | null;
  locale: string;
}) {
  const t = useTranslations("addToJourney");
  const [open, setOpen] = useState(false);
  const [requested, setRequested] = useState(false);

  const triggerClass = cn(buttonVariants(), "min-h-11 w-full gap-2 text-sm");

  if (signInHref) {
    return (
      <Link href={signInHref} className={triggerClass}>
        <Plus className="size-4" aria-hidden />
        {t("sign_in")}
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        className={triggerClass}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setRequested(true);
          setOpen(true);
        }}
      >
        <Plus className="size-4" aria-hidden />
        {t("action")}
      </button>

      {requested ? (
        <AddToJourneySheet
          experienceId={experienceId}
          experienceName={experienceName}
          journeys={journeys}
          planHref={planHref}
          locale={locale}
          open={open}
          onOpenChange={setOpen}
        />
      ) : null}
    </>
  );
}
