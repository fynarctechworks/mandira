"use client";

import { cn } from "@mandhira/ui";
import { buttonVariants } from "@mandhira/ui/components/ui/button";
import { Languages } from "lucide-react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useState } from "react";

/*
 * The sheet loads on the first tap, not with the Live screen, which is already close to
 * TRD-PERF-001's first-load budget (see `day-health-sheet.tsx` for the same pattern).
 */
const PhraseSheet = dynamic(() => import("./phrase-sheet").then((module) => module.PhraseSheet), {
  ssr: false,
});

/**
 * The NOW card's phrase shortcut (PRD-LIVE-002, PRD F12).
 *
 * Beside the card, not one of its actions: PRD-LIVE-002 fixes those at exactly three, and
 * opening a phrase changes nothing about the journey. The phrases come from the device, so
 * this works with no signal — which is when someone most needs to ask the way.
 */
export function PhraseShortcut({
  destinationId,
  locale,
}: {
  destinationId: string;
  locale: string;
}) {
  const t = useTranslations("phrases");
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);

  return (
    <>
      <button
        type="button"
        className={cn(
          buttonVariants({ variant: "outline" }),
          "min-h-11 gap-1.5 self-start px-3 text-sm",
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setSession((count) => count + 1);
          setOpen(true);
        }}
      >
        <Languages className="size-4" aria-hidden />
        {t("open")}
      </button>

      {session > 0 ? (
        <PhraseSheet
          key={session}
          destinationId={destinationId}
          locale={locale}
          open={open}
          onOpenChange={setOpen}
        />
      ) : null}
    </>
  );
}
