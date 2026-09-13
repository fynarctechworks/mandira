"use client";

import { ChecklistRow } from "@mandhira/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";

import type { NotificationPrefs } from "@mandhira/journey-engine";

import type { TravelerNotificationPrefs } from "../lib/notifications";

/**
 * The seven switches (PRD-NOTF-001).
 *
 * All of them switchable, none of them buried. PRD F15's restraint rules — never more than
 * one non-journey notification a week, no marketing — only hold if the traveler can see
 * what they have agreed to and change it in one tap.
 *
 * Each switch says WHEN it fires, not just what it is called. "Leave-by reminder" tells
 * someone nothing; "15 minutes before you need to set off" tells them whether they want it.
 */
const TYPES: (keyof NotificationPrefs)[] = [
  "prepare_deadline",
  "journey_tomorrow",
  "leave_by",
  "journey_change",
  "report_resolved",
  "advisory",
  "suggestion",
];

export function NotificationPreferences({ initial }: { initial: TravelerNotificationPrefs }) {
  const t = useTranslations("notificationPrefs");
  const [prefs, setPrefs] = useState<TravelerNotificationPrefs>(initial);
  const [problem, setProblem] = useState<string | null>(null);

  async function toggle(key: keyof TravelerNotificationPrefs, next: boolean) {
    // Optimistic: a switch that waits for a round trip gets tapped twice.
    setPrefs((current) => ({ ...current, [key]: next }));
    setProblem(null);

    const response = await fetch("/api/notifications/preferences", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ [key]: next }),
    });

    const payload = await response.json().catch(() => ({ ok: false }));

    if (!payload.ok) {
      setPrefs((current) => ({ ...current, [key]: !next }));
      setProblem(t("not_saved"));
    }
  }

  return (
    <section aria-labelledby="notification-prefs" className="flex flex-col gap-2">
      <h2 id="notification-prefs" className="text-h2">
        {t("title")}
      </h2>

      {problem ? (
        <p role="alert" className="text-body-sm text-status-broken">
          {problem}
        </p>
      ) : null}

      <div className="rounded-lg border border-border bg-bg-surface px-4">
        {TYPES.map((key) => (
          <ChecklistRow
            key={key}
            label={t(`types.${key}.label`)}
            checked={prefs[key] ?? false}
            onCheckedChange={(value) => void toggle(key, value)}
            // The timing behind each switch, on request rather than crowding the row.
            why={t(`types.${key}.when`)}
            whyLabel={t("when")}
          />
        ))}
      </div>

      {/*
       * Email is a separate yes (D-171): the switches above decide WHAT, this decides whether
       * any of it also arrives by email. Off until the traveler turns it on.
       */}
      <div className="rounded-lg border border-border bg-bg-surface px-4">
        <ChecklistRow
          label={t("email_label")}
          checked={prefs.email ?? false}
          onCheckedChange={(value) => void toggle("email", value)}
          why={t("email_why")}
          whyLabel={t("email_why_label")}
        />
      </div>

      <p className="text-caption text-text-secondary">{t("restraint")}</p>
    </section>
  );
}
