import { dateForDay } from "./time";
import type { Journey, JourneyItem, KnowledgeBundle, TravelerProfile } from "./types";

export type PrepareGroup = "bookings" | "documents" | "carry" | "know" | "travelers" | "downloads";

export type PrepareTask = {
  /** Stable across regeneration, so a ticked box survives an edit elsewhere. */
  id: string;
  group: PrepareGroup;
  /** i18n key plus params — the engine never renders language (see health.ts). */
  titleKey: string;
  params?: Record<string, string | number>;
  /** Free text lifted verbatim from knowledge, e.g. how to book. */
  body?: string;
  sourceItemId?: string;
  /** Where the traveler can check this themselves. */
  trustRef?: { entityId: string; field: string };
  /** Deadline as YYYY-MM-DD, for the notification schedule (F15). */
  dueDate?: string;
};

/**
 * The Prepare checklist (PRD F7, TRD §5.1 `generatePrepareTasks`).
 *
 * Everything here is DERIVED from what the journey already contains — nothing is invented
 * and nothing is generic advice. A checklist that pads itself with "remember your
 * passport" teaches travelers to skim it, and then the one task that actually mattered
 * gets skimmed too.
 *
 * Carry items are deduplicated across the journey: being told to bring socks once per
 * temple is noise, and the traveler only owns one pair.
 */
export function generatePrepareTasks(input: {
  journey: Journey;
  items: JourneyItem[];
  knowledge: KnowledgeBundle;
  travelers?: TravelerProfile[];
}): PrepareTask[] {
  const { journey, items, knowledge } = input;
  const travelers = input.travelers ?? [];
  const tasks: PrepareTask[] = [];

  // ── Bookings ────────────────────────────────────────────────────────────────
  for (const item of items) {
    if (!item.experience_id) continue;

    const experience = knowledge.experiences.find((e) => e.id === item.experience_id);
    if (!experience?.advance_booking_required) continue;

    const itemDate = dateForDay(journey.start_date, item.day_index);

    tasks.push({
      id: `booking:${item.id}`,
      group: "bookings",
      titleKey: "prepare.booking.title",
      params: { experienceId: experience.id },
      ...(experience.advance_booking_how ? { body: experience.advance_booking_how } : {}),
      sourceItemId: item.id,
      trustRef: { entityId: experience.id, field: "advance_booking_required" },
      // Counting back from the day it happens: booking opens N days before, so that is
      // the earliest useful reminder and the latest safe one.
      ...(experience.advance_booking_opens_days_before != null
        ? { dueDate: dateForDay(itemDate, -experience.advance_booking_opens_days_before) }
        : { dueDate: itemDate }),
    });
  }

  // ── What to carry, and what to know ─────────────────────────────────────────
  const seenCarry = new Set<string>();
  const seenKnow = new Set<string>();

  for (const item of items) {
    const place = item.place_id ? knowledge.places.find((p) => p.id === item.place_id) : undefined;
    if (!place) continue;

    if (place.dress_code && !seenKnow.has(place.dress_code)) {
      seenKnow.add(place.dress_code);
      tasks.push({
        id: `know:dress:${place.id}`,
        group: "know",
        titleKey: "prepare.know.dress_code",
        body: place.dress_code,
        sourceItemId: item.id,
        trustRef: { entityId: place.id, field: "entry_requirements_i18n" },
      });
    }

    if (place.entry_requirements && !seenCarry.has(place.entry_requirements)) {
      seenCarry.add(place.entry_requirements);
      tasks.push({
        id: `carry:entry:${place.id}`,
        group: "carry",
        titleKey: "prepare.carry.entry_requirement",
        body: place.entry_requirements,
        sourceItemId: item.id,
        trustRef: { entityId: place.id, field: "entry_requirements_i18n" },
      });
    }
  }

  // ── For your travelers ──────────────────────────────────────────────────────
  // Only raised when someone in the group actually needs it. A generic accessibility
  // note shown to everyone is the fastest way to make it invisible to the people it is for.
  const needsStepFree = travelers.some(
    (t) => t.mobility === "wheelchair" || t.mobility === "limited_walking",
  );
  if (needsStepFree) {
    tasks.push({
      id: "travelers:step-free",
      group: "travelers",
      titleKey: "prepare.travelers.check_step_free",
    });
  }

  if (travelers.some((t) => t.mobility === "needs_rest_frequently")) {
    tasks.push({
      id: "travelers:rest-points",
      group: "travelers",
      titleKey: "prepare.travelers.confirm_rest_points",
    });
  }

  // ── Downloads (F11) ─────────────────────────────────────────────────────────
  tasks.push({
    id: "downloads:offline",
    group: "downloads",
    titleKey: "prepare.downloads.save_offline",
  });

  return tasks;
}
