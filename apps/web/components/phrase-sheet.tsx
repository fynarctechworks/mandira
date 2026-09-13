"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@mandhira/ui/components/ui/sheet";
import { Skeleton } from "@mandhira/ui/components/ui/skeleton";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { groupPhrases, type PhraseGroup } from "../lib/phrases";
import { readPhrasesOffline } from "../lib/offline/phrases-local";
import { PhraseAssistance } from "./phrase-assistance";

/**
 * A17 as a sheet over Live, read from the device only (PRD-OFFL-001).
 *
 * The journey snapshot keeps the destination's pack current whenever Live syncs, so reading
 * the store is right online and offline alike — the same read-the-cache-either-way rule as
 * the rest of Live, rather than a network path that is only ever exercised with a signal.
 */
export function PhraseSheet({
  destinationId,
  locale,
  open,
  onOpenChange,
}: {
  destinationId: string;
  locale: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("phrases");
  const [groups, setGroups] = useState<PhraseGroup[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void readPhrasesOffline(destinationId).then((rows) => {
      if (!cancelled) setGroups(groupPhrases(rows ?? [], locale));
    });
    return () => {
      cancelled = true;
    };
  }, [destinationId, locale]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("sheet_title")}</SheetTitle>
          <SheetDescription>{t("sheet_description")}</SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6">
          {groups === null ? (
            <div aria-busy="true" className="flex flex-col gap-3">
              <span className="sr-only">{t("loading")}</span>
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          ) : groups.length === 0 ? (
            <p className="text-body-sm text-text-secondary">{t("empty_offline")}</p>
          ) : (
            <PhraseAssistance groups={groups} locale={locale} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
