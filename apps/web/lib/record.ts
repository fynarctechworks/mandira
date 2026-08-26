import type { Json } from "@mandhira/db/types";
import type { PriorityTier } from "@mandhira/journey-engine";

import { getJourney } from "./journeys";
import type { ReflectionAnswers } from "./reflection";
import type { webSupabase } from "./supabase";

/**
 * The Journey Record (PRD F16, PRD-CMPL-001/002).
 *
 * What actually happened, built from the Done taps the traveler made during the day —
 * never inferred. An item is completed because somebody said so, which is the same rule
 * that governs every other state change in this product (PRD Principle 6).
 *
 * THE THING THIS MUST NOT BECOME. PRD F16 is explicit: protected experiences completed is
 * a "plain statement, no score". No percentage, no streak, no badge. A pilgrimage is not a
 * fitness tracker, and a traveler who missed the evening aarti because their mother needed
 * to sit down has not underperformed. The same reasoning that keeps a number off Journey
 * Health (PRD F5).
 */
type Client = Awaited<ReturnType<typeof webSupabase>>;

export type RecordItem = {
  itemId: string;
  label: string;
  tier: PriorityTier;
  plannedStartAt: string | null;
  /** When the traveler actually marked it, when they did. */
  actualEndAt: string | null;
  completed: boolean;
  note: string | null;
};

export type JourneyRecord = {
  journeyId: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  days: { dayIndex: number; items: RecordItem[] }[];
  /** Counts, for the plain statement — never rendered as a ratio or a score. */
  plannedCount: number;
  completedCount: number;
  protectedPlanned: number;
  protectedCompleted: number;
  reflection: ReflectionAnswers | null;
  /** Whether the journey's last day is behind the traveler. */
  isOver: boolean;
  /** True once the traveler tapped Complete and the snapshot was frozen. */
  isComplete: boolean;
};

// PRD F16's three questions live in a leaf module so the client form can reach them; see
// `lib/reflection.ts`. Re-exported here because the Record is where they belong logically.
export { REFLECTION_QUESTIONS, type ReflectionAnswers } from "./reflection";

export async function getJourneyRecord(
  supabase: Client,
  journeyId: string,
  locale: string,
): Promise<JourneyRecord | null> {
  const detail = await getJourney(supabase, journeyId, locale);
  if (!detail) return null;

  const { journey, items, labels } = detail;

  const { data: record } = await supabase
    .from("journey_records")
    .select("reflection_answers, summary")
    .eq("journey_id", journeyId)
    .maybeSingle();

  const { data: notes } = await supabase
    .from("journey_item_notes")
    .select("item_id, body")
    .in(
      "item_id",
      items.map((item) => item.id),
    );

  const noteFor = new Map(
    (notes ?? []).map((row) => [row.item_id as string, row.body as string]),
  );

  const rows: RecordItem[] = items.map((item) => ({
    itemId: item.id,
    label: item.experience_id
      ? (labels.get(item.experience_id) ?? "Something you added")
      : "Free time",
    tier: item.tier,
    plannedStartAt: item.planned_start_at ?? null,
    actualEndAt: item.actual_end_at,
    // From the Done tap and nothing else. An item whose time simply passed is not done.
    completed: item.status === "done",
    note: noteFor.get(item.id) ?? null,
  }));

  const dayIndexes = [...new Set(items.map((item) => item.day_index))].sort((a, b) => a - b);

  const protectedRows = rows.filter(
    (row) => row.tier === "protected" || row.tier === "fixed",
  );

  /*
   * Once the traveler has tapped Complete the counts come from the frozen snapshot rather
   * than from the items as they stand today. A journey that is over should not revise its
   * own account of itself because something was renamed or tidied away afterwards.
   */
  const frozen = (record?.summary as RecordSummary | null) ?? null;

  return {
    journeyId: journey.id,
    title: journey.title ?? "Your journey",
    startDate: journey.startDate,
    endDate: journey.endDate,
    days: dayIndexes.map((dayIndex) => ({
      dayIndex,
      items: rows.filter((_, index) => items[index]?.day_index === dayIndex),
    })),
    plannedCount: frozen?.planned ?? rows.length,
    completedCount: frozen?.completed ?? rows.filter((row) => row.completed).length,
    protectedPlanned: frozen?.protected_planned ?? protectedRows.length,
    protectedCompleted:
      frozen?.protected_completed ?? protectedRows.filter((row) => row.completed).length,
    reflection: (record?.reflection_answers as ReflectionAnswers | null) ?? null,
    isOver: isOver(journey.endDate ?? journey.startDate),
    isComplete: journey.status === "completed",
  };
}

/** Saves the traveler's private answers. */
export async function saveReflection(
  supabase: Client,
  journeyId: string,
  answers: ReflectionAnswers,
): Promise<void> {
  await supabase.from("journey_records").upsert(
    {
      journey_id: journeyId,
      reflection_answers: answers as unknown as Json,
    },
    { onConflict: "journey_id" },
  );
}

/**
 * The brief for "plan a similar journey" (PRD-CMPL-003).
 *
 * Carries the travelers, the pace and the TIERS — what the traveler said mattered, not
 * what they ended up doing. Someone who missed an experience they had marked must-do still
 * considers it must-do; rebuilding from what was completed would quietly demote the thing
 * they were most disappointed to miss.
 *
 * Dates are deliberately absent. A similar journey is a different journey, and guessing
 * when is the one thing the traveler certainly has an opinion about.
 */
export async function similarBrief(
  supabase: Client,
  journeyId: string,
): Promise<{
  destinationId: string | null;
  dayCount: number;
  pace: string;
  mustDo: string[];
  wouldLike: string[];
  travelers: { mobility: string; ageBand: string }[];
} | null> {
  const detail = await getJourney(supabase, journeyId, "en");
  if (!detail) return null;

  const { journey, items } = detail;

  const { data: travelers } = await supabase
    .from("journey_travelers")
    .select("traveler_profiles(mobility, age_band)")
    .eq("journey_id", journeyId);

  const experienceOf = (tiers: PriorityTier[]) =>
    items
      .filter((item) => tiers.includes(item.tier) && item.experience_id)
      .map((item) => item.experience_id!)
      .filter((id, index, all) => all.indexOf(id) === index);

  return {
    destinationId: journey.destinationId,
    dayCount: Math.max(1, new Set(items.map((item) => item.day_index)).size),
    pace: journey.pace,
    // FIXED collapses into must-do: a booked slot in a NEW journey is not booked yet.
    mustDo: experienceOf(["protected", "fixed"]),
    wouldLike: experienceOf(["important", "optional"]),
    travelers: (travelers ?? [])
      .map((row) => row.traveler_profiles as { mobility: string; age_band: string } | null)
      .filter((profile): profile is { mobility: string; age_band: string } => !!profile)
      .map((profile) => ({ mobility: profile.mobility, ageBand: profile.age_band })),
  };
}

/**
 * The summary snapshot, per TRD §4.6: completed vs planned, per item.
 *
 * Written once, when the traveler taps Complete. After that the Record reads the frozen
 * row rather than recomputing — a journey that is over should not change its account of
 * itself because a place was later renamed or an item was tidied away. Before the tap
 * there is no row and the Record is a live projection, which is what makes it readable
 * mid-journey.
 */
export type RecordSummary = {
  planned: number;
  completed: number;
  protected_planned: number;
  protected_completed: number;
  items: { item_id: string; tier: PriorityTier; completed: boolean }[];
};

export function summaryOf(record: JourneyRecord): RecordSummary {
  return {
    planned: record.plannedCount,
    completed: record.completedCount,
    protected_planned: record.protectedPlanned,
    protected_completed: record.protectedCompleted,
    items: record.days.flatMap((day) =>
      day.items.map((item) => ({
        item_id: item.itemId,
        tier: item.tier,
        completed: item.completed,
      })),
    ),
  };
}

/**
 * The explicit tap that ends a journey (TRD §5, `POST /api/journeys/:id/complete`).
 *
 * Explicit because PRD Principle 6 makes it so: a journey does not become complete because
 * its last date slid into the past. Somebody says it is done. The status move and the
 * snapshot happen together, and the reflection the traveler may already have written is
 * left exactly as it was — completing is not a reason to overwrite their own words.
 */
export async function completeJourney(
  supabase: Client,
  journeyId: string,
  locale: string,
): Promise<{ summary: RecordSummary } | null> {
  const record = await getJourneyRecord(supabase, journeyId, locale);
  if (!record) return null;

  const summary = summaryOf(record);

  await supabase.from("journey_records").upsert(
    { journey_id: journeyId, summary: summary as unknown as Json },
    { onConflict: "journey_id" },
  );

  // RLS decides whether this lands at all; `owns_journey` is the same gate as the read.
  await supabase.from("journeys").update({ status: "completed" }).eq("id", journeyId);

  return { summary };
}

/** Whether the journey's last day has passed, in plain UTC-day terms. */
function isOver(endDate: string | null): boolean {
  if (!endDate) return false;
  return Date.parse(`${endDate}T23:59:59Z`) < Date.now();
}
