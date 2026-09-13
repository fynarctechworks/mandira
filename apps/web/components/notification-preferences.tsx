"use client";

import { ChecklistRow } from "@mandhira/ui";
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
const TYPES: { key: keyof NotificationPrefs; label: string; when: string }[] = [
  {
    key: "prepare_deadline",
    label: "Booking deadlines",
    when: "7 days and 1 day before something needs booking.",
  },
  {
    key: "journey_tomorrow",
    label: "Your journey starts tomorrow",
    when: "The evening before, with everything saved for offline.",
  },
  {
    key: "leave_by",
    label: "Time to set off",
    when: "15 minutes before you need to leave. Works without a signal.",
  },
  {
    key: "journey_change",
    label: "Something changed",
    when: "When a change affects your day, with the options to deal with it.",
  },
  {
    key: "report_resolved",
    label: "We checked something you told us",
    when: "When a report you sent has been looked at.",
  },
  {
    key: "advisory",
    label: "Advisories",
    when: "When there's something worth knowing about a place you're going.",
  },
  {
    key: "suggestion",
    label: "Suggestions",
    when: "Occasional ideas based on where you're going. Off unless you turn it on.",
  },
];

export function NotificationPreferences({ initial }: { initial: TravelerNotificationPrefs }) {
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
      setProblem("That didn't save. Please try again.");
    }
  }

  return (
    <section aria-labelledby="notification-prefs" className="flex flex-col gap-2">
      <h2 id="notification-prefs" className="text-h2">
        What you hear about
      </h2>

      {problem ? (
        <p role="alert" className="text-body-sm text-status-broken">
          {problem}
        </p>
      ) : null}

      <div className="rounded-lg border border-border bg-bg-surface px-4">
        {TYPES.map(({ key, label, when }) => (
          <ChecklistRow
            key={key}
            label={label}
            checked={prefs[key] ?? false}
            onCheckedChange={(value) => void toggle(key, value)}
            // The timing behind each switch, on request rather than crowding the row.
            why={when}
            whyLabel="When?"
          />
        ))}
      </div>

      {/*
       * Email is a separate yes (D-171): the switches above decide WHAT, this decides whether
       * any of it also arrives by email. Off until the traveler turns it on.
       */}
      <div className="rounded-lg border border-border bg-bg-surface px-4">
        <ChecklistRow
          label="Also by email"
          checked={prefs.email ?? false}
          onCheckedChange={(value) => void toggle("email", value)}
          why="The same messages the switches above allow, sent to the address you sign in with. Off unless you turn it on."
          whyLabel="What is sent?"
        />
      </div>

      <p className="text-caption text-text-secondary">
        Mandhira never sends marketing, and never more than one non-journey message a week.
      </p>
    </section>
  );
}
