"use client";

import { cn } from "@mandhira/ui";
import { buttonVariants } from "@mandhira/ui/components/ui/button";
import { Pencil } from "lucide-react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useState } from "react";

import type { JourneyDetails } from "./journey-details-panel";

export type { JourneyDetails } from "./journey-details-panel";

/*
 * The form sheet loads on the first tap, not with the journey page: nothing in it is needed
 * before the traveler asks to edit, and carrying it in the first load put the page over
 * TRD-PERF-001's 180 kB.
 */
const JourneyDetailsPanel = dynamic(
  () => import("./journey-details-panel").then((module) => module.JourneyDetailsPanel),
  { ssr: false },
);

/**
 * The journey's own details (TRD `PATCH /api/journeys/:id`).
 *
 * Each opening mounts a fresh panel (`key`) from the journey as it is now, so an edit that was
 * cancelled — or one already saved and refreshed — is never shown as still pending.
 */
export function JourneyDetailsSheet({
  journeyId,
  initial,
}: {
  journeyId: string;
  initial: JourneyDetails;
}) {
  const t = useTranslations("journeyEdit");
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);

  return (
    <>
      <button
        type="button"
        className={cn(buttonVariants({ variant: "outline" }), "min-h-11 gap-2 self-start text-sm")}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setSession((count) => count + 1);
          setOpen(true);
        }}
      >
        <Pencil className="size-4" aria-hidden />
        {t("open")}
      </button>

      {session > 0 ? (
        <JourneyDetailsPanel
          key={session}
          journeyId={journeyId}
          initial={initial}
          open={open}
          onOpenChange={setOpen}
        />
      ) : null}
    </>
  );
}
