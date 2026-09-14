import { computeHealth, type HealthReport } from "./health";
import type { JourneyItem, KnowledgeBundle } from "./types";

/**
 * The plan as it would run if everything took its longest recorded time (PRD-HLTH-004).
 *
 * Journey Health plans on LIKELY durations, because planning every day on the longest
 * possible visit would make every reasonable day look broken. But a traveler should be able
 * to see what happens on a slow day, so the worst case swaps in the longest duration anyone
 * has recorded: the item's own maximum, else its experience's, else its place's visit
 * maximum. An item with no longer duration on record keeps the one it has — the worst case
 * is what the knowledge says, not a guess.
 */
export function worstCaseItems(items: JourneyItem[], knowledge: KnowledgeBundle): JourneyItem[] {
  const experiences = new Map(
    knowledge.experiences.map((experience) => [experience.id, experience]),
  );
  const places = new Map(knowledge.places.map((place) => [place.id, place]));

  return items.map((item) => {
    const longest =
      item.duration_max_minutes ??
      (item.experience_id ? experiences.get(item.experience_id)?.duration_max_minutes : null) ??
      (item.place_id ? places.get(item.place_id)?.visit_duration_max_minutes : null) ??
      null;

    if (longest == null || longest <= (item.duration_likely_minutes ?? 0)) return item;
    return { ...item, duration_likely_minutes: longest };
  });
}

/** Journey Health for the worst case: the same five checks, on the longest durations. */
export function computeWorstCase(input: Parameters<typeof computeHealth>[0]): HealthReport {
  return computeHealth({ ...input, items: worstCaseItems(input.items, input.knowledge) });
}
