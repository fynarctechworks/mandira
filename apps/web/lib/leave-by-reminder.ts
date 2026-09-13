import { NOTIFICATION_LEAD } from "@mandhira/journey-engine";
import { useEffect } from "react";

/**
 * The offline leave-by reminder (PRD-NOTF-002).
 *
 * THE LIMITATION, STATED PLAINLY. The web has no dependable way to schedule a notification
 * for later: a service worker is stopped within seconds of going idle, and the one API that
 * scheduled a notification ahead of time was withdrawn from browsers. So this is a timer in
 * the Live screen itself. It fires only while that screen is still alive on the phone — the
 * traveler must have opened Live that day, and a browser that has discarded the tab takes the
 * timer with it. Server push covers the online case; this covers the hillside with no signal.
 */
const MAX_TIMER_MS = 2_147_483_647;

/** Milliseconds until the reminder should show, or null when there is nothing left to remind. */
export function reminderDelay(
  leaveByAt: string | null,
  nowMs: number,
  leadMinutes: number = NOTIFICATION_LEAD.leaveByMinutes,
): number | null {
  if (!leaveByAt) return null;

  const leaveBy = Date.parse(leaveByAt);
  if (Number.isNaN(leaveBy) || leaveBy <= nowMs) return null;

  const delay = Math.max(0, leaveBy - leadMinutes * 60_000 - nowMs);
  return delay > MAX_TIMER_MS ? null : delay;
}

type Registration = Pick<ServiceWorkerRegistration, "showNotification">;

/** Schedules one reminder and returns the function that cancels it. */
export function scheduleLeaveByReminder(input: {
  leaveByAt: string | null;
  tag: string;
  title: string;
  body: string;
  nowMs: number;
  permission: NotificationPermission;
  ready: () => Promise<Registration>;
}): () => void {
  // Asking for permission belongs to the notifications screen, never to a timer.
  if (input.permission !== "granted") return () => undefined;

  const delay = reminderDelay(input.leaveByAt, input.nowMs);
  if (delay === null) return () => undefined;

  const timer = setTimeout(() => {
    void input
      .ready()
      // One tag per journey, so a rescheduled reminder replaces the old one instead of stacking.
      .then((registration) =>
        registration.showNotification(input.title, { body: input.body, tag: input.tag }),
      )
      .catch(() => undefined);
  }, delay);

  return () => clearTimeout(timer);
}

export function useLeaveByReminder(input: {
  enabled: boolean;
  leaveByAt: string | null;
  tag: string;
  title: string;
  body: string;
}): void {
  const { enabled, leaveByAt, tag, title, body } = input;

  useEffect(() => {
    if (!enabled || typeof Notification === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    return scheduleLeaveByReminder({
      leaveByAt,
      tag,
      title,
      body,
      nowMs: Date.now(),
      permission: Notification.permission,
      ready: () => navigator.serviceWorker.ready,
    });
  }, [enabled, leaveByAt, tag, title, body]);
}
