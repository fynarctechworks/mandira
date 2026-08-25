import { resolveAvailability } from "./availability";
import { computeHealth, type HealthReport } from "./health";
import { scheduleDay } from "./schedule";
import { dateForDay, fromInstant, toMinutes } from "./time";
import type {
  BriefExperience,
  IsoDate,
  Journey,
  JourneyBrief,
  JourneyItem,
  KnowledgeBundle,
  Pace,
  PriorityTier,
  TravelerProfile,
  Warning,
} from "./types";

export type BuildResult = {
  journey: Journey;
  items: JourneyItem[];
  health: HealthReport;
  warnings: Warning[];
};

/**
 * How full a day is allowed to get before the packer moves on to the next one (D-059).
 *
 * PRD §2.4 names the three paces but attaches no numbers to them, so these are the engine's
 * reading of the words: "relaxed" has to leave visible room, "full" fills the day the
 * traveler declared. They are targets for PLACEMENT only — nothing is ever dropped for
 * exceeding them, and health still judges the result on its own terms.
 */
const PACE_TARGET: Record<Pace, number> = {
  relaxed: 0.6,
  balanced: 0.8,
  full: 1.0,
};

const DEFAULTS = {
  timezone: "Asia/Kolkata",
  day_start_time: "06:00",
  day_end_time: "21:00",
  pace: "balanced" as Pace,
};

/**
 * Turn a confirmed brief into a day-assigned, scheduled journey (TRD §5.1, PRD F4).
 *
 * The brief is a CLOSED list. Everything placed here was named by the traveler or
 * confirmed by them in the brief review; the engine adds nothing of its own. PRD F4 is
 * explicit that there is no "auto-fill my day with top places" — a journey padded with
 * plausible suggestions is no longer the journey the traveler described, and they would
 * have to audit it to find out what they actually asked for.
 *
 * Nothing is dropped either. An item that will not fit anywhere is still placed on its
 * least-bad day, and Journey Health says so. What to give up is a decision the traveler
 * makes through a Change Card (PRD Principle 6).
 *
 * Deterministic: the same brief and the same knowledge produce identical output, with no
 * clock and no randomness. That is what lets the server build once, persist, and have the
 * phone agree offline.
 */
export function buildInitialJourney(input: {
  brief: JourneyBrief;
  knowledge: KnowledgeBundle;
  travelers?: TravelerProfile[];
}): BuildResult {
  const { brief, knowledge } = input;
  const travelers = input.travelers ?? [];

  const journey = journeyFromBrief(brief);
  const dayCount = dayCountOf(brief);
  const windowMinutes = toMinutes(journey.day_end_time) - toMinutes(journey.day_start_time);
  const target = windowMinutes * PACE_TARGET[brief.pace ?? DEFAULTS.pace];

  const warnings: Warning[] = [];
  const load = new Array<number>(dayCount).fill(0);
  const drafts: Draft[] = [];
  let sequence = 0;

  const nextId = () => `bi-${(sequence += 1)}`;

  // ── FIXED first: they are the anchors, and they claim their day outright ────
  for (const commitment of brief.fixed_commitments ?? []) {
    const dayIndex = dayIndexOfInstant(commitment.at, journey, dayCount);
    const duration = fixedDuration(commitment, journey, dayIndex);

    load[dayIndex] = (load[dayIndex] ?? 0) + duration;

    drafts.push({
      dayIndex,
      startHint: fromInstant(
        commitment.at,
        dateForDay(journey.start_date, dayIndex),
        journey.timezone,
      ),
      item: {
        id: commitment.id ?? nextId(),
        day_index: dayIndex,
        sort_order: 0,
        item_type: commitment.item_type ?? "fixed_commitment",
        tier: "fixed",
        place_id: commitment.place_id ?? null,
        fixed_start_at: commitment.at,
        fixed_end_at: commitment.end_at ?? null,
        duration_likely_minutes: duration,
      },
    });
  }

  // ── Then by tier, strongest first, so the traveler's priorities get the room ─
  const byTier: [PriorityTier, BriefExperience[]][] = [
    ["protected", brief.must_do ?? []],
    ["important", brief.would_like ?? []],
    ["optional", brief.might_do ?? []],
  ];

  for (const [tier, entries] of byTier) {
    for (const entry of entries) {
      const duration = experienceDuration(entry.experience_id, knowledge);
      const placement = chooseDay({
        entry,
        journey,
        dayCount,
        knowledge,
        load,
        target,
        duration,
      });

      if (placement.unavailableEverywhere) {
        warnings.push({
          code: "outside_availability",
          itemId: entry.experience_id,
          message:
            "This is not available on any day of the journey, so it was placed anyway for you to decide on.",
        });
      }

      load[placement.dayIndex] = (load[placement.dayIndex] ?? 0) + duration;

      drafts.push({
        dayIndex: placement.dayIndex,
        startHint: placement.startHint,
        item: {
          id: nextId(),
          day_index: placement.dayIndex,
          sort_order: 0,
          item_type: "experience",
          tier,
          experience_id: entry.experience_id,
          place_id: placeOf(entry.experience_id, knowledge),
          preferred_window_start: entry.preferred_window_start ?? null,
          preferred_window_end: entry.preferred_window_end ?? null,
          duration_likely_minutes: duration > 0 ? duration : null,
        },
      });
    }
  }

  // ── Chronological order within each day, then schedule ──────────────────────
  const items: JourneyItem[] = [];

  for (let dayIndex = 0; dayIndex < dayCount; dayIndex += 1) {
    const ofDay = drafts
      .filter((d) => d.dayIndex === dayIndex)
      .sort((a, b) => a.startHint - b.startHint)
      .map((d, index) => ({ ...d.item, sort_order: index }));

    const result = scheduleDay({
      journey,
      dayIndex,
      items: ofDay,
      knowledge,
      travelers,
    });

    items.push(...result.items);
    warnings.push(...result.warnings);
  }

  const health = computeHealth({ journey, items, knowledge, travelers });

  return { journey, items, health, warnings };
}

type Draft = {
  dayIndex: number;
  /** Minutes from local midnight, used only to order the day; scheduling refines it. */
  startHint: number;
  item: JourneyItem;
};

function journeyFromBrief(brief: JourneyBrief): Journey {
  return {
    id: "draft",
    start_date: brief.start_date,
    end_date: brief.end_date ?? dateForDay(brief.start_date, dayCountOf(brief) - 1),
    timezone: brief.timezone ?? DEFAULTS.timezone,
    day_start_time: brief.day_start_time ?? DEFAULTS.day_start_time,
    day_end_time: brief.day_end_time ?? DEFAULTS.day_end_time,
  };
}

function dayCountOf(brief: JourneyBrief): number {
  if (brief.day_count != null && brief.day_count > 0) return brief.day_count;

  if (brief.end_date) {
    const days =
      Math.round(
        (Date.parse(`${brief.end_date}T00:00:00Z`) - Date.parse(`${brief.start_date}T00:00:00Z`)) /
          86_400_000,
      ) + 1;
    if (days > 0) return days;
  }

  return 1;
}

/**
 * The earliest day that both suits the experience and still has room.
 *
 * Availability comes first and room second: a day that is merely busy can absorb one more
 * item and show it as Tight, whereas a day the experience does not run on cannot be fixed
 * by any amount of space.
 */
function chooseDay(input: {
  entry: BriefExperience;
  journey: Journey;
  dayCount: number;
  knowledge: KnowledgeBundle;
  load: number[];
  target: number;
  duration: number;
}): { dayIndex: number; startHint: number; unavailableEverywhere: boolean } {
  const { entry, journey, dayCount, knowledge, load, target, duration } = input;

  // A day the traveler pinned themselves is not the engine's to reconsider.
  if (entry.day_index != null) {
    const dayIndex = clamp(entry.day_index, 0, dayCount - 1);
    return {
      dayIndex,
      startHint: startHint(entry, journey, dayIndex, knowledge),
      unavailableEverywhere: false,
    };
  }

  const feasible: number[] = [];

  for (let dayIndex = 0; dayIndex < dayCount; dayIndex += 1) {
    if (availableOn(entry.experience_id, journey, dayIndex, knowledge)) feasible.push(dayIndex);
  }

  const candidates = feasible.length > 0 ? feasible : range(dayCount);
  const roomy = candidates.find((d) => (load[d] ?? 0) + duration <= target);

  // Nothing has room: the least-loaded feasible day, so the overflow lands where it does
  // least damage and health explains it.
  const dayIndex =
    roomy ??
    candidates.reduce((best, d) => ((load[d] ?? 0) < (load[best] ?? 0) ? d : best), candidates[0]!);

  return {
    dayIndex,
    startHint: startHint(entry, journey, dayIndex, knowledge),
    unavailableEverywhere: feasible.length === 0,
  };
}

function availableOn(
  experienceId: string,
  journey: Journey,
  dayIndex: number,
  knowledge: KnowledgeBundle,
): boolean {
  const rules = knowledge.availability_rules.filter((r) => r.experience_id === experienceId);
  if (rules.length === 0) return true;

  return resolveAvailability({
    rules,
    date: dateForDay(journey.start_date, dayIndex),
    ...openingScheduleOf(experienceId, knowledge),
  }).available;
}

/** Where the item most likely starts, used purely to order the day sensibly. */
function startHint(
  entry: BriefExperience,
  journey: Journey,
  dayIndex: number,
  knowledge: KnowledgeBundle,
): number {
  if (entry.preferred_window_start) return toMinutes(entry.preferred_window_start);

  const rules = knowledge.availability_rules.filter((r) => r.experience_id === entry.experience_id);
  if (rules.length === 0) return toMinutes(journey.day_start_time);

  const availability = resolveAvailability({
    rules,
    date: dateForDay(journey.start_date, dayIndex),
    ...openingScheduleOf(entry.experience_id, knowledge),
  });

  const first = availability.windows[0];
  return first ? toMinutes(first.start) : toMinutes(journey.day_start_time);
}

function openingScheduleOf(experienceId: string, knowledge: KnowledgeBundle) {
  const experience = knowledge.experiences.find((e) => e.id === experienceId);
  const place = experience?.place_id
    ? knowledge.places.find((p) => p.id === experience.place_id)
    : undefined;
  return place?.opening_schedule ? { openingSchedule: place.opening_schedule } : {};
}

function experienceDuration(experienceId: string, knowledge: KnowledgeBundle): number {
  const experience = knowledge.experiences.find((e) => e.id === experienceId);
  if (experience?.duration_likely_minutes != null) return experience.duration_likely_minutes;

  const place = experience?.place_id
    ? knowledge.places.find((p) => p.id === experience.place_id)
    : undefined;
  // 0, not a guess. An unrecorded duration is a gap in the knowledge, and scheduleDay
  // raises `no_duration` for it rather than the engine inventing a plausible number.
  return place?.visit_duration_likely_minutes ?? 0;
}

function placeOf(experienceId: string, knowledge: KnowledgeBundle): string | null {
  return knowledge.experiences.find((e) => e.id === experienceId)?.place_id ?? null;
}

function fixedDuration(
  commitment: { at: string; end_at?: string | null },
  journey: Journey,
  dayIndex: number,
): number {
  if (!commitment.end_at) return 0;
  const date: IsoDate = dateForDay(journey.start_date, dayIndex);
  return Math.max(
    0,
    fromInstant(commitment.end_at, date, journey.timezone) -
      fromInstant(commitment.at, date, journey.timezone),
  );
}

/**
 * Which day of the journey a fixed commitment falls on.
 *
 * Clamped rather than rejected: a return train dated after the last day is a brief the
 * traveler can still fix, and refusing to build anything would leave them with a blank
 * screen instead of a journey with one visible problem.
 */
function dayIndexOfInstant(instant: string, journey: Journey, dayCount: number): number {
  const minutes = fromInstant(instant, journey.start_date, journey.timezone);
  return clamp(Math.floor(minutes / 1440), 0, dayCount - 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function range(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i);
}
