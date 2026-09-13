"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";

import { groupPhrases, type PhraseRow } from "../lib/phrases";
import { savePhrasesOffline } from "../lib/offline/phrases-local";
import { PhraseAssistance } from "./phrase-assistance";

/**
 * A17 on the destination's phrase page.
 *
 * The rows arrive from the server, and are kept on the device as they are shown — so a
 * traveler who opened the pack once with a signal still has it in the Live sheet when they
 * have none, even before any journey of theirs has synced (PRD-OFFL-001).
 */
export function PhrasePackView({
  destinationId,
  locale,
  phrases,
}: {
  destinationId: string;
  locale: string;
  phrases: PhraseRow[];
}) {
  const t = useTranslations("phrases");
  const groups = useMemo(() => groupPhrases(phrases, locale), [phrases, locale]);

  useEffect(() => {
    void savePhrasesOffline(destinationId, phrases);
  }, [destinationId, phrases]);

  if (groups.length === 0) {
    return <p className="text-body-sm text-text-secondary">{t("empty")}</p>;
  }

  return <PhraseAssistance groups={groups} locale={locale} />;
}
