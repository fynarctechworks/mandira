import type { PrepareTask } from "./prepare";
import { dateForDay, fromInstant, toInstant } from "./time";
import type { Journey, JourneyItem } from "./types";

/** The `notification_type_enum` vocabulary, verbatim (TRD §4.1). */
export type NotificationType =
  | "prepare_deadline"
  | "journey_tomorrow"
  | "leave_by"
  | "journey_change"
  | "report_resolved"
  | "advisory"
  | "suggestion";

/**
 * One notification the journey implies, ready to be persisted.
 *
 * Copy is i18n keys and params, like health causes and change options — the scheduler runs
 * on a server that does not know the traveler's language, and the sender renders it from
 * the traveler's own profile locale at send time.
 */
export type NotificationDraft = {
  /** Stable across re-scheduling, so the same reminder is never queued twice. */
  dedupeKey: string;
  type: NotificationType;
  scheduledFor: string;
  titleKey: string;
  bodyKey: string;
  params?: Record<string, string | number>;
  itemId?: string;
  channel: "push" | "inapp";
};

/** Per-type switches, defaulting to PRD F15's own defaults. */
export type NotificationPrefs = Partial<Record<NotificationType, boolean>>;

/** PRD F15: prepare deadlines are reminded at 7 days and 1 day before. */
const PREPARE_LEAD_DAYS = [7, 1];
/** PRD F15: 15 minutes before each travel leg. */
const LEAVE_BY_LEAD_MINUTES = 15;
/** PRD F15: "journey starts tomorrow" goes out at 18:00 the day before. */
const TOMORROW_HOUR = 18;

/** PRD F15's defaults. Only suggestions are off, and only they are marketing-adjacent. */
const DEFAULT_ON: Record<NotificationType, boolean> = {
  prepare_deadline: true,
  journey_tomorrow: true,
  leave_by: true,
  journey_change: true,
  report_resolved: true,
  advisory: true,
  suggestion: false,
};

/**
 * Every notification a journey implies, as of `now` (PRD F15, TRD §5.4
 * `schedule_notifications`).
 *
 * Pure and deterministic, like the rest of the engine: the Edge Function that runs every
 * fifteen minutes hands in the journey and the clock and persists what comes back. That is
 * what lets the same rules be tested without a scheduler, and run on the phone for the
 * local leave-by reminders that have to work offline (PRD F15).
 *
 * Nothing already in the past is scheduled. A "leave in 15 minutes" that arrives an hour
 * late is worse than silence — it is a prompt to hurry towards something already missed.
 */
export function scheduleNotifications(input: {
  journey: Journey;
  items: JourneyItem[];
  prepareTasks?: PrepareTask[];
  prefs?: NotificationPrefs;
  now: string;
}): NotificationDraft[] {
  const { journey, items, now } = input;
  const prefs = input.prefs ?? {};
  const nowMs = Date.parse(now);

  const wants = (type: NotificationType) => prefs[type] ?? DEFAULT_ON[type];

  const drafts: NotificationDraft[] = [];

  // ── Prepare deadlines, 7 days and 1 day out ─────────────────────────────────
  if (wants("prepare_deadline")) {
    for (const task of input.prepareTasks ?? []) {
      if (!task.dueDate) continue;

      for (const leadDays of PREPARE_LEAD_DAYS) {
        // 09:00 local: early enough to act on the same day, late enough not to be a
        // phone buzzing before anyone is up.
        const at = toInstant(dateForDay(task.dueDate, -leadDays), 9 * 60, journey.timezone);

        drafts.push({
          dedupeKey: `prepare:${task.id}:${leadDays}`,
          type: "prepare_deadline",
          scheduledFor: at,
          titleKey: "notify.prepare_deadline.title",
          bodyKey: "notify.prepare_deadline.body",
          params: { taskId: task.id, days: leadDays },
          channel: "push",
        });
      }
    }
  }

  // ── The evening before ──────────────────────────────────────────────────────
  if (wants("journey_tomorrow")) {
    drafts.push({
      dedupeKey: `tomorrow:${journey.id}`,
      type: "journey_tomorrow",
      scheduledFor: toInstant(
        dateForDay(journey.start_date, -1),
        TOMORROW_HOUR * 60,
        journey.timezone,
      ),
      titleKey: "notify.journey_tomorrow.title",
      bodyKey: "notify.journey_tomorrow.body",
      params: { journeyId: journey.id },
      channel: "push",
    });
  }

  // ── Leave-by, once per item that needs travelling to ────────────────────────
  if (wants("leave_by")) {
    const byDay = new Map<number, JourneyItem[]>();
    for (const item of items) {
      byDay.set(item.day_index, [...(byDay.get(item.day_index) ?? []), item]);
    }

    for (const [dayIndex, dayItems] of byDay) {
      const ordered = [...dayItems].sort((a, b) => a.sort_order - b.sort_order);
      const date = dateForDay(journey.start_date, dayIndex);

      ordered.forEach((item, index) => {
        // The first item of the day has nothing to leave FROM, and a reminder to leave
        // for where you already are is noise.
        if (index === 0 || !item.planned_start_at) return;

        if (Number.isNaN(Date.parse(item.planned_start_at))) return;
        const startMinutes = fromInstant(item.planned_start_at, date, journey.timezone);

        drafts.push({
          dedupeKey: `leaveby:${item.id}`,
          type: "leave_by",
          scheduledFor: toInstant(
            date,
            startMinutes - (item.buffer_minutes ?? 0) - LEAVE_BY_LEAD_MINUTES,
            journey.timezone,
          ),
          titleKey: "notify.leave_by.title",
          bodyKey: "notify.leave_by.body",
          params: { itemId: item.id, minutes: LEAVE_BY_LEAD_MINUTES },
          itemId: item.id,
          channel: "push",
        });
      });
    }
  }

  return drafts
    .filter((draft) => Date.parse(draft.scheduledFor) > nowMs)
    .sort((a, b) => Date.parse(a.scheduledFor) - Date.parse(b.scheduledFor));
}

/**
 * PRD F15: never more than one non-journey notification per week.
 *
 * Applied here rather than at send time so the cap is visible in what gets queued. A
 * suggestion the traveler never sees because it was silently dropped later is still a
 * suggestion the product decided to make.
 */
export function applyWeeklyCap(
  drafts: NotificationDraft[],
  lastNonJourneySentAt: string | null,
): NotificationDraft[] {
  const NON_JOURNEY: NotificationType[] = ["suggestion", "advisory"];
  const weekMs = 7 * 86_400_000;

  let lastAt = lastNonJourneySentAt ? Date.parse(lastNonJourneySentAt) : -Infinity;

  return drafts.filter((draft) => {
    if (!NON_JOURNEY.includes(draft.type)) return true;

    const at = Date.parse(draft.scheduledFor);
    if (at - lastAt < weekMs) return false;

    lastAt = at;
    return true;
  });
}

/** Exported so a caller can state a preference explicitly rather than by omission. */
export { DEFAULT_ON as NOTIFICATION_DEFAULTS };

/** The PRD F15 lead times, exported so the UI can explain them in the same words. */
export const NOTIFICATION_LEAD = {
  prepareDays: PREPARE_LEAD_DAYS,
  leaveByMinutes: LEAVE_BY_LEAD_MINUTES,
  tomorrowHour: TOMORROW_HOUR,
} as const;
