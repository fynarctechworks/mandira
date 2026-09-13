"use client";

import {
  ChangeCard as ChangeCardSheet,
  type ChangeCardAffectedItem,
  type ChangeCardOption,
} from "@mandhira/ui";
import type { AffectedItem, ChangeCard, ChangeOption } from "@mandhira/journey-engine";
import { useLocale, useTranslations } from "next-intl";

import { engineText } from "../lib/engine-text";

/**
 * The Change Card a traveler actually reads (PRD F6, PRD-ADPT-004/006).
 *
 * Every sentence comes from the key the engine attached to the option it generated. An
 * earlier version re-derived labels from the ladder step with a hand-written map that had
 * drifted: a removal was shown as "Swap the order of two things", and removing an IMPORTANT
 * item was described as "the one you marked as optional". The traveler consents to exactly
 * what the engine will do, or the tap is not consent.
 *
 * Nothing here decides anything. The plan moves only when an option is pressed
 * (PRD-ADPT-005).
 */
export function ChangeSheet({
  card,
  open,
  onDecide,
  onOpenChange,
  pending,
  offline = false,
  itemName,
  timeZone = "Asia/Kolkata",
}: {
  card: ChangeCard;
  open: boolean;
  /** `null` means "keep as is", which is a real decision and is recorded as one. */
  onDecide: (optionId: string | null) => void;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  /** Worked out on the device, from the cached snapshot (PRD-ADPT-007). */
  offline?: boolean;
  /** The traveler-facing name of a journey item, when the caller has it. */
  itemName?: (itemId: string) => string | undefined;
  timeZone?: string;
}) {
  const t = useTranslations();
  const locale = useLocale();

  const recommended = card.recommended;
  if (!recommended) return null;

  const nameFor = (itemId: unknown): string =>
    (typeof itemId === "string" ? itemName?.(itemId) : undefined) ??
    t("change.card.one_of_your_plans");

  const clock = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone });
  const timeOf = (instant: string | null) =>
    instant ? clock.format(new Date(instant)) : t("change.card.unscheduled");

  const optionValues = (option: ChangeOption) => {
    const params = option.params ?? {};
    return {
      ...params,
      item: nameFor(params["itemId"]),
      day: typeof params["toDayIndex"] === "number" ? params["toDayIndex"] + 1 : "",
      time: params["startTime"] ?? "",
    };
  };

  const affected = (entry: AffectedItem): ChangeCardAffectedItem => {
    const title = nameFor(entry.itemId);
    const before = timeOf(entry.beforeStartAt);

    if (entry.afterDayIndex === null) {
      return { title, before, outcome: t("change.card.left_out") };
    }

    const time = timeOf(entry.afterStartAt);
    return {
      title,
      before,
      after:
        entry.afterDayIndex === entry.beforeDayIndex
          ? time
          : t("change.card.on_day", { day: entry.afterDayIndex + 1, time }),
    };
  };

  const toOption = (option: ChangeOption): ChangeCardOption => ({
    id: option.id,
    label: engineText(t, option.labelKey, optionValues(option)),
    because: engineText(t, option.becauseKey, optionValues(option)),
    // Cards persisted before before/after times existed carry no `affected`.
    affectedItems: (option.affected ?? []).map(affected),
    resultingHealth: option.resultingState,
    requiresConfirmation: option.requiresConfirmation,
  });

  const others = card.options.filter((option) => option.id !== recommended.id).slice(0, 2);

  const trustNote = (exposure: { key: string }[]) => {
    if (exposure.some((cause) => cause.key === "health.trust.unverified")) {
      return t("change.trust.unverified");
    }
    if (exposure.some((cause) => cause.key === "health.trust.conflicting")) {
      return t("change.trust.conflicting");
    }
    return t("change.trust.changed");
  };

  return (
    <ChangeCardSheet
      open={open}
      onOpenChange={onOpenChange}
      labels={{
        title: t("change.card.title"),
        whatChanged: t("change.card.what_changed"),
        whyItMatters: t("change.card.why_it_matters"),
        recommended: t("change.card.recommended"),
        otherOptions: t("change.card.other_options"),
        keepAsIs: t("change.card.keep_as_is"),
        resultingHealth: t("change.card.resulting_health"),
      }}
      whatChanged={engineText(t, card.whatChanged.key, {
        ...card.whatChanged.params,
        item: nameFor(card.whatChanged.params?.["itemId"]),
      })}
      whyItMatters={
        [...new Set(card.whyItMatters.map((cause) => engineText(t, cause.key, cause.params)))]
          .filter(Boolean)
          .join(" ") || t("change.card.why_fallback")
      }
      recommended={toOption(recommended)}
      otherOptions={others.map(toOption)}
      keepAsIs={{
        label: t("change.card.keep_as_is"),
        resultingHealth: card.keepAsIs.resultingState,
        because: t(`change.keep.${card.keepAsIs.resultingState}`),
      }}
      /*
       * The only apply path in the product. Disabled while a decision is in flight, so a
       * double-tap on a slow connection cannot answer the same card twice.
       */
      onChooseOption={(id) => {
        if (!pending) onDecide(id);
      }}
      onKeepAsIs={() => {
        if (!pending) onDecide(null);
      }}
      /*
       * PRD-ADPT-006: a card triggered by knowledge or a live feed says what it rests on.
       * Offline, it says instead that traveler profiles were not available to the device
       * (PRD-PRIV-002), so the next online check is authoritative.
       */
      {...(offline
        ? { lowConfidenceNote: t("change.offline_note") }
        : card.trustExposure?.length
          ? { lowConfidenceNote: trustNote(card.trustExposure) }
          : {})}
    />
  );
}
