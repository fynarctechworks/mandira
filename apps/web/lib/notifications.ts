import {
  applyWeeklyCap,
  generatePrepareTasks,
  scheduleNotifications,
  NOTIFICATION_DEFAULTS,
  type NotificationDraft,
  type NotificationPrefs,
  type NotificationType,
} from "@mandhira/journey-engine";
import type { Database, Json } from "@mandhira/db/types";

import { createServiceRoleSupabase } from "@mandhira/db/client/server";

import { mustList, mustMaybe, mustWrite } from "./data-error";
import { getJourney, toEngineJourney } from "./journeys";
import { getKnowledgeBundle } from "./knowledge";
import type { webSupabase } from "./supabase";

/**
 * Notifications (PRD F15, NOTF-01..04).
 *
 * The engine decides WHAT a journey implies and WHEN; this materialises those drafts into
 * rows and reads them back. Copy stays as i18n keys the whole way through, because the
 * scheduler runs on a server that does not know the traveler's language — it is rendered
 * at send time from their own profile locale.
 *
 * PRD F15's restraint rules are not decoration. Seven types, all switchable, suggestions
 * off by default, and never more than one non-journey notification a week. A pilgrimage
 * app that buzzes is an app people turn off, and then the leave-by reminder that mattered
 * goes with it.
 */
type Client = Awaited<ReturnType<typeof webSupabase>>;

export type StoredNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  journeyId: string | null;
  scheduledFor: string | null;
  sentAt: string | null;
  readAt: string | null;
};

/**
 * Re-derive a journey's notifications and persist what is missing.
 *
 * READS as the traveler, WRITES as the system — and that split is deliberate, not
 * convenience. `notifications` grants `authenticated` only SELECT and UPDATE: a traveler
 * may read their reminders and mark them read, and may not create one. Scheduling is
 * something the product decides, and a traveler who could insert rows could schedule
 * anything for themselves.
 *
 * So the journey is read through the request-scoped client — RLS is what stops someone
 * scheduling reminders for a journey they do not own — and only the INSERT uses
 * service-role. Getting that the other way round would either fail silently (the bug this
 * replaced) or let RLS be bypassed on the read, which is the half that matters.
 *
 * Idempotent on the engine's `dedupeKey`, so calling it on every save cannot queue the
 * same reminder twice — the same guarantee, and for the same reason, as the Prepare
 * checklist's stable ids.
 */
export async function syncJourneyNotifications(
  supabase: Client,
  journeyId: string,
  userId: string,
  locale: string,
): Promise<{ scheduled: number }> {
  const detail = await getJourney(supabase, journeyId, locale);
  if (!detail) return { scheduled: 0 };

  const { journey, items } = detail;
  const knowledge = journey.destinationId
    ? await getKnowledgeBundle(journey.destinationId, locale)
    : EMPTY_BUNDLE;

  const prefs = await readPreferences(supabase, userId);
  const engineJourney = toEngineJourney(journey);

  /*
   * The prepare tasks are regenerated rather than read from `prepare_tasks`.
   *
   * PRD F15's deadline reminders are derived from the same engine output the checklist is
   * (B-021), and a row is only written there once someone opens the Prepare tab. Reading
   * the table would mean a traveler who never opened it gets no booking reminders — which
   * is exactly the traveler who needs them.
   */
  const prepareTasks = generatePrepareTasks({ journey: engineJourney, items, knowledge });

  const drafts = scheduleNotifications({
    journey: engineJourney,
    items,
    prepareTasks,
    prefs,
    // The engine has no clock (D-005), so the caller says what "now" is.
    now: new Date().toISOString(),
  });

  /*
   * PRD-NOTF-003: at most one non-journey notification a week. Applied HERE rather than at
   * send time, because a capped draft should never become a row — a queue full of
   * suppressed rows is a queue somebody eventually "fixes" by sending them.
   */
  const capped = applyWeeklyCap(drafts, await lastNonJourneySend(supabase, userId));
  if (capped.length === 0) return { scheduled: 0 };

  const existing = await existingKeys(supabase, userId, journeyId);
  const fresh = capped.filter((draft) => !existing.has(draft.dedupeKey));
  if (fresh.length === 0) return { scheduled: 0 };

  // The only privileged write in this file, and it writes for exactly the user id the
  // caller authenticated — never one taken from a request body.
  const inserted = await createServiceRoleSupabase()
    .from("notifications")
    .insert(fresh.map((draft) => toRow(draft, userId, journeyId)));

  /*
   * THROWS rather than reporting zero. This line returned `{ scheduled: 0 }` on failure
   * for the whole of B-027, and `service_role` had no grant on any table (0025), so it
   * failed every single time — silently, while the traveler was told their reminders were
   * set. A privileged write that cannot say it failed is worse than one that is missing.
   *
   * The caller is inside `withApi`, which turns a throw into an honest error response.
   */
  mustWrite(inserted, "notifications insert");

  return { scheduled: fresh.length };
}

function toRow(
  draft: NotificationDraft,
  userId: string,
  journeyId: string,
): Database["public"]["Tables"]["notifications"]["Insert"] {
  return {
    user_id: userId,
    journey_id: journeyId,
    notification_type: draft.type,
    /*
     * The i18n KEY and its params are stored, never a rendered sentence. A traveler who
     * switches to Telugu before a reminder fires should get Telugu — and a sentence frozen
     * at scheduling time would hand them the language they were using last Tuesday.
     */
    title_i18n: { key: draft.titleKey } as unknown as Json,
    body_i18n: { key: draft.bodyKey } as unknown as Json,
    payload: {
      dedupeKey: draft.dedupeKey,
      params: draft.params ?? {},
      ...(draft.itemId ? { itemId: draft.itemId } : {}),
    } as unknown as Json,
    scheduled_for: draft.scheduledFor,
    channel: draft.channel,
    status: "scheduled",
  };
}

/** Dedupe keys already queued for this journey. */
async function existingKeys(
  supabase: Client,
  userId: string,
  journeyId: string,
): Promise<Set<string>> {
  const data = mustList(
    await supabase
      .from("notifications")
      .select("payload")
      .eq("user_id", userId)
      .eq("journey_id", journeyId),
    "notifications",
  );

  return new Set(
    data
      .map((row) => (row.payload as { dedupeKey?: string } | null)?.dedupeKey)
      .filter((key): key is string => !!key),
  );
}

/**
 * When the last non-journey notification went out, for PRD-NOTF-003's cap.
 *
 * Only `suggestion` and `advisory` count against it. A leave-by reminder is not a message
 * from us — it is the journey the traveler asked for, arriving on time — and counting it
 * would mean the cap silenced the one notification nobody would want silenced.
 */
async function lastNonJourneySend(supabase: Client, userId: string): Promise<string | null> {
  const data = mustMaybe(
    await supabase
      .from("notifications")
      .select("sent_at")
      .eq("user_id", userId)
      .in("notification_type", ["suggestion", "advisory"])
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    "notifications",
  );

  return data?.sent_at ?? null;
}

/**
 * The seven switches plus the email opt-in (D-171). Email is consent, not a notification
 * type, so it sits beside them and defaults off: nobody is mailed because they signed in.
 */
export type TravelerNotificationPrefs = NotificationPrefs & { email?: boolean };

/** The traveler's per-type switches, over PRD F15's defaults. */
export async function readPreferences(
  supabase: Client,
  userId: string,
): Promise<TravelerNotificationPrefs> {
  const data = mustMaybe(
    await supabase.from("profiles").select("notification_prefs").eq("id", userId).maybeSingle(),
    "profiles",
  );

  const stored = (data?.notification_prefs ?? {}) as Record<string, boolean>;
  return { ...NOTIFICATION_DEFAULTS, email: false, ...stored };
}

export async function writePreferences(
  supabase: Client,
  userId: string,
  prefs: TravelerNotificationPrefs,
): Promise<void> {
  const current = await readPreferences(supabase, userId);

  mustWrite(
    await supabase
      .from("profiles")
      .update({ notification_prefs: { ...current, ...prefs } as unknown as Json })
      .eq("id", userId),
    "profiles update",
  );
}

/**
 * The in-app list (PRD F15).
 *
 * Scheduled-but-unsent notifications are deliberately EXCLUDED. A list showing a reminder
 * that has not fired yet reads as a message the traveler somehow missed, and it makes the
 * unread count meaningless.
 */
export async function listNotifications(
  supabase: Client,
  locale: string,
): Promise<StoredNotification[]> {
  const data = mustList(
    await supabase
      .from("notifications")
      .select(
        "id, notification_type, title_i18n, body_i18n, journey_id, scheduled_for, sent_at, read_at, payload",
      )
      .not("sent_at", "is", null)
      .neq("channel", "email")
      .order("sent_at", { ascending: false })
      .limit(50),
    "notifications",
  );

  return data.map((row) => {
    const payload = (row.payload ?? {}) as { params?: Record<string, string | number> };
    const params = payload.params ?? {};

    return {
      id: row.id as string,
      type: row.notification_type as NotificationType,
      title: render((row.title_i18n as { key?: string } | null)?.key, params, locale),
      body: render((row.body_i18n as { key?: string } | null)?.key, params, locale),
      journeyId: row.journey_id,
      scheduledFor: row.scheduled_for,
      sentAt: row.sent_at,
      readAt: row.read_at,
    };
  });
}

export async function markRead(supabase: Client, id: string): Promise<void> {
  mustWrite(
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id),
    "notifications update",
  );
}

/**
 * The engine's keys, rendered.
 *
 * Beside the reader rather than in the engine, exactly like health causes and change
 * options — the engine states which notification applies, never how to say it. PRD §12.7's
 * voice throughout: no alarm words, no exclamation marks, and every one says what to do
 * rather than only what happened.
 */
export function render(
  key: string | undefined,
  params: Record<string, string | number>,
  locale: string,
): string {
  void locale;
  const minutes = String(params["minutes"] ?? "15");
  const place = String(params["place"] ?? "your next stop");
  const days = String(params["days"] ?? "");
  const time = String(params["time"] ?? "");

  return (
    {
      "notify.prepare_deadline.title": "Something needs booking",
      "notify.prepare_deadline.body": days
        ? `Booking opens ${days} days before, and that is coming up.`
        : "A booking on your list is coming up.",
      "notify.journey_tomorrow.title": "Your journey starts tomorrow",
      "notify.journey_tomorrow.body": time
        ? `The first thing is at ${time}. Everything is saved for offline.`
        : "Everything is saved for offline.",
      "notify.leave_by.title": "Time to head off",
      "notify.leave_by.body": `About ${minutes} minutes to reach ${place}.`,
      "notify.journey_change.title": "Something in your day changed",
      "notify.journey_change.body": "There are a couple of ways through it when you're ready.",
      "notify.report_resolved.title": "Thanks — we checked that",
      "notify.report_resolved.body": "What you told us about has been looked at.",
      "notify.advisory.title": "Worth knowing before you go",
      "notify.advisory.body": "There's an advisory for somewhere on your journey.",
      "notify.suggestion.title": "Something you might like",
      "notify.suggestion.body": "Based on where you're going.",
    }[key ?? ""] ?? ""
  );
}

const EMPTY_BUNDLE = {
  places: [],
  experiences: [],
  availability_rules: [],
  routes: [],
  transport_connections: [],
  travel_estimates: [],
  trust: {},
};
