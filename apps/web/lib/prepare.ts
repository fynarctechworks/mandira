import {
  generatePrepareTasks,
  type PrepareGroup,
  type PrepareTask,
  type TravelerProfile,
} from "@mandhira/journey-engine";

import { getJourney, toEngineJourney } from "./journeys";
import { getKnowledgeBundle } from "./knowledge";
import type { webSupabase } from "./supabase";
import type { TrustEntry, TrustMap } from "./trust";

/**
 * The Prepare checklist (PRD F7, PRD-PREP-001).
 *
 * A row in `prepare_tasks` records WHICH task exists and whether the traveler ticked it.
 * It does not record the words. Those are rendered here from the engine plus the current
 * knowledge bundle every time the list is read, for the same reason Journey Health is
 * never stored: a sentence frozen at generation time keeps today's dress code and today's
 * English forever, and the traveler finds out it went stale at the gate.
 *
 * Regeneration is therefore idempotent and non-destructive — it upserts on `engine_key`
 * and never deletes. A task whose item was removed simply stops being rendered; if the
 * item comes back, so does the tick.
 */
type Client = Awaited<ReturnType<typeof webSupabase>>;

export type PrepareItem = {
  /** The engine's stable id, which is also what the tick route addresses. */
  key: string;
  group: PrepareGroup;
  title: string;
  /** Verbatim knowledge — how to book, what to wear. Never AI-written. */
  body: string | null;
  dueDate: string | null;
  isDone: boolean;
  /** PRD F9: a task derived from knowledge carries the badge of the FIELD it came from. */
  trust: TrustEntry | undefined;
  trustFieldLabel: string | null;
};

export type PrepareGroupView = {
  group: PrepareGroup;
  heading: string;
  tasks: PrepareItem[];
};

export type PrepareChecklist = {
  journeyTitle: string;
  startDate: string | null;
  groups: PrepareGroupView[];
  /** How many are ticked, so the screen can say it without counting in JSX. */
  doneCount: number;
  totalCount: number;
};

/** PRD F7's own group names, in the order it lists them. */
const GROUP_ORDER: PrepareGroup[] = [
  "bookings",
  "documents",
  "carry",
  "know",
  "travelers",
  "downloads",
];

const GROUP_HEADING: Record<PrepareGroup, string> = {
  bookings: "Bookings & tickets",
  documents: "Documents",
  carry: "What to carry",
  know: "Know before you go",
  travelers: "For your travelers",
  downloads: "Downloads",
};

/**
 * The engine's title keys turned into sentences.
 *
 * Beside the reader rather than in the engine, exactly like the health causes and the
 * item-rule refusals: the engine states which task applies, never how to say it.
 */
function titleFor(task: PrepareTask, labels: Map<string, string>): string {
  switch (task.titleKey) {
    case "prepare.booking.title": {
      const id = String(task.params?.["experienceId"] ?? "");
      return `Book ${labels.get(id) ?? "something you added"} in advance`;
    }
    case "prepare.know.dress_code":
      return "What to wear";
    case "prepare.carry.entry_requirement":
      return "What to bring to get in";
    case "prepare.travelers.check_step_free":
      return "Check step-free access before you go";
    case "prepare.travelers.confirm_rest_points":
      return "Confirm where you can rest along the way";
    case "prepare.downloads.save_offline":
      return "Save your journey for offline";
    default:
      return "Something to prepare";
  }
}

/** What a trust badge on this task is ABOUT, read out to a screen reader. */
const FIELD_LABEL: Record<string, string> = {
  advance_booking_required: "Booking requirement",
  entry_requirements_i18n: "Entry requirements",
  opening_schedule: "Opening hours",
};

/**
 * Build the checklist for one journey: regenerate, persist identities, render.
 *
 * The write on a read path is deliberate. It is an idempotent upsert, and doing it here
 * means the checklist can never disagree with the journey no matter which path last
 * changed an item — including a path that has not been written yet. The alternative,
 * syncing from every mutation site, is correct only for as long as nobody forgets one.
 */
export async function getPrepareChecklist(
  supabase: Client,
  journeyId: string,
  locale: string,
): Promise<PrepareChecklist | null> {
  const detail = await getJourney(supabase, journeyId, locale);
  if (!detail) return null;

  const { journey, items, labels } = detail;
  const empty = {
    journeyTitle: journey.title ?? "Your journey",
    startDate: journey.startDate,
    groups: [] as PrepareGroupView[],
    doneCount: 0,
    totalCount: 0,
  };

  // A journey with no destination has nothing to derive a checklist FROM. That is an
  // empty state, not an error — the traveler is mid-edit.
  if (!journey.destinationId) return empty;

  const [knowledge, travelers] = await Promise.all([
    getKnowledgeBundle(journey.destinationId, locale),
    travelersFor(supabase, journeyId),
  ]);

  const tasks = generatePrepareTasks({
    journey: toEngineJourney(journey),
    items,
    knowledge,
    travelers,
  });

  if (tasks.length === 0) return empty;

  await syncTaskRows(supabase, journeyId, tasks);

  const [doneKeys, trust] = await Promise.all([
    doneKeysFor(supabase, journeyId),
    trustFor(supabase, tasks),
  ]);

  const rendered: PrepareItem[] = tasks.map((task) => ({
    key: task.id,
    group: task.group,
    title: titleFor(task, labels),
    body: task.body ?? null,
    dueDate: task.dueDate ?? null,
    isDone: doneKeys.has(task.id),
    trust: task.trustRef ? trust.get(task.trustRef.entityId)?.[task.trustRef.field] : undefined,
    trustFieldLabel: task.trustRef ? (FIELD_LABEL[task.trustRef.field] ?? null) : null,
  }));

  return {
    journeyTitle: journey.title ?? "Your journey",
    startDate: journey.startDate,
    groups: GROUP_ORDER.map((group) => ({
      group,
      heading: GROUP_HEADING[group],
      tasks: rendered.filter((t) => t.group === group),
    })).filter((g) => g.tasks.length > 0),
    doneCount: rendered.filter((t) => t.isDone).length,
    totalCount: rendered.length,
  };
}

/** Upsert one row per engine task. Never deletes — see the module comment. */
async function syncTaskRows(
  supabase: Client,
  journeyId: string,
  tasks: PrepareTask[],
): Promise<void> {
  const rows = tasks.map((task, index) => ({
    journey_id: journeyId,
    engine_key: task.id,
    group_name: task.group,
    sort_order: index,
    source_item_id: task.sourceItemId ?? null,
    trust_ref: task.trustRef ?? null,
    /*
     * The notification job (B-027) scans `due_at`, so it is stored even though the
     * rendered date is derived from the engine. Midday rather than midnight: a booking
     * reminder that lands at 00:00 is a reminder nobody is awake for.
     */
    due_at: task.dueDate ? `${task.dueDate}T12:00:00Z` : null,
  }));

  const { error } = await supabase
    .from("prepare_tasks")
    .upsert(rows, { onConflict: "journey_id,engine_key", ignoreDuplicates: false });

  if (error) throw error;
}

async function doneKeysFor(supabase: Client, journeyId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from("prepare_tasks")
    .select("engine_key, is_done")
    .eq("journey_id", journeyId)
    .eq("is_done", true);

  return new Set((data ?? []).map((row) => row.engine_key).filter((key): key is string => !!key));
}

/** Trust for whatever the tasks point at, read through the published views only. */
async function trustFor(supabase: Client, tasks: PrepareTask[]): Promise<Map<string, TrustMap>> {
  const ids = [
    ...new Set(tasks.map((t) => t.trustRef?.entityId).filter((id): id is string => !!id)),
  ];
  const trust = new Map<string, TrustMap>();
  if (ids.length === 0) return trust;

  const [places, experiences] = await Promise.all([
    supabase.from("v_published_places").select("id, trust").in("id", ids),
    supabase.from("v_published_experiences").select("id, trust").in("id", ids),
  ]);

  for (const row of [...(places.data ?? []), ...(experiences.data ?? [])]) {
    if (row.id) trust.set(row.id, (row.trust ?? {}) as TrustMap);
  }

  return trust;
}

/**
 * The travelers' needs, which decide whether the "For your travelers" group exists at all.
 *
 * `traveler_profiles` is the most sensitive table in the schema. It is read HERE, on the
 * traveler's own request-scoped client, and what leaves this function is a checklist that
 * says "check step-free access" — never which traveler needs it.
 */
async function travelersFor(supabase: Client, journeyId: string): Promise<TravelerProfile[]> {
  const { data } = await supabase
    .from("journey_travelers")
    .select("traveler_profiles(id, mobility, age_band)")
    .eq("journey_id", journeyId);

  return (data ?? [])
    .map((row) => row.traveler_profiles as TravelerProfile | null)
    .filter((profile): profile is TravelerProfile => !!profile);
}

/**
 * Tick or untick one task, addressed by the engine's stable key.
 *
 * Returns false when nothing matched, which the route turns into a 404. RLS is what
 * actually stops another traveler's task from being touched; this only reports it.
 */
export async function setTaskDone(
  supabase: Client,
  journeyId: string,
  engineKey: string,
  isDone: boolean,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("prepare_tasks")
    .update({ is_done: isDone, done_at: isDone ? new Date().toISOString() : null })
    .eq("journey_id", journeyId)
    .eq("engine_key", engineKey)
    .select("id");

  if (error) throw error;
  return (data ?? []).length > 0;
}
