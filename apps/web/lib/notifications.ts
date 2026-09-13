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
import { reportError } from "@mandhira/db/reporting";
import { isLocale } from "@mandhira/i18n";
import { createTranslator, type AbstractIntlMessages } from "next-intl";

import { createServiceRoleSupabase } from "@mandhira/db/client/server";

import { mustList, mustMaybe, mustWrite } from "./data-error";
import { getJourney, toEngineJourney } from "./journeys";
import { getKnowledgeBundle } from "./knowledge";
import type { webSupabase } from "./supabase";
import en from "../messages/en.json";
import hi from "../messages/hi.json";
import te from "../messages/te.json";

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
  locale?: string,
): Promise<{ scheduled: number; cancelled: number }> {
  // Names in the traveler's own language when the caller does not say which.
  const language = locale ?? (await profileLocale(supabase, userId));
  const detail = await getJourney(supabase, journeyId, language);
  if (!detail) return { scheduled: 0, cancelled: 0 };

  const { journey, items, labels } = detail;
  const knowledge = journey.destinationId
    ? await getKnowledgeBundle(journey.destinationId, language)
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

  /*
   * A leave-by only for what is still ahead: done, skipped or already under way, a reminder to
   * set off for it is noise. Each names where the traveler is heading, so the push reads
   * "About 15 minutes to reach Hill Temple" rather than "your next stop".
   */
  const ahead = new Map(
    items.filter((item) => item.status === "planned").map((item) => [item.id, item]),
  );
  const drafts = scheduleNotifications({
    journey: engineJourney,
    items,
    prepareTasks,
    prefs,
    // So a leave-by counts the travel to reach each item, exactly as Live's departure-by does.
    knowledge,
    // The engine has no clock (D-005), so the caller says what "now" is.
    now: new Date().toISOString(),
  }).flatMap((draft): NotificationDraft[] => {
    if (draft.type !== "leave_by") return [draft];
    const item = draft.itemId ? ahead.get(draft.itemId) : undefined;
    if (!item) return [];
    const place =
      (item.place_id ? labels.get(item.place_id) : undefined) ??
      (item.experience_id ? labels.get(item.experience_id) : undefined);
    return [place ? { ...draft, params: { ...draft.params, place } } : draft];
  });

  /*
   * PRD-NOTF-003: at most one non-journey notification a week. Applied HERE rather than at
   * send time, because a capped draft should never become a row — a queue full of
   * suppressed rows is a queue somebody eventually "fixes" by sending them.
   */
  const capped = applyWeeklyCap(drafts, await lastNonJourneySend(supabase, userId));
  const wanted = new Map(capped.map((draft) => [draft.dedupeKey, draft]));

  // Service-role for the queue itself; the journey was read as the traveler above, so RLS has
  // already established it is theirs, and every statement below is pinned to their user id.
  const service = createServiceRoleSupabase();
  const existing = await existingRows(service, userId, journeyId);

  /*
   * PRD-NOTF-002: a plan that changed must not keep its old reminders. A scheduled reminder
   * this journey no longer implies — or implies at another time, or for another place — is
   * cancelled and the current one queued in its place. Sent ones are history and stay; so
   * does anything this function did not derive (a Change Card, a reply to a report).
   */
  const stale = existing.filter(
    (row) =>
      row.status === "scheduled" && DERIVED.test(row.key) && !matches(row, wanted.get(row.key)),
  );
  if (stale.length > 0) {
    mustWrite(
      await service
        .from("notifications")
        .update({ status: "cancelled" })
        .in(
          "id",
          stale.map((row) => row.id),
        )
        .eq("user_id", userId)
        .eq("status", "scheduled"),
      "notifications cancel",
    );
  }

  // Delivered, failed, or still correctly queued: never queued a second time.
  const staleIds = new Set(stale.map((row) => row.id));
  const taken = new Set(
    existing
      .filter((row) => row.status !== "cancelled" && !staleIds.has(row.id))
      .map((row) => row.key),
  );
  const fresh = capped.filter((draft) => !taken.has(draft.dedupeKey));

  if (fresh.length > 0) {
    /*
     * THROWS rather than reporting zero. This returned `{ scheduled: 0 }` on failure for the
     * whole of B-027 while `service_role` had no grant (0025), so it failed every time —
     * silently, while the traveler was told their reminders were set.
     */
    mustWrite(
      await service
        .from("notifications")
        .insert(fresh.map((draft) => toRow(draft, userId, journeyId))),
      "notifications insert",
    );
  }

  return { scheduled: fresh.length, cancelled: stale.length };
}

/**
 * Re-derive a journey's reminders after its plan changed, without ever failing that change:
 * the traveler's edit stands, and a reminder that could not be rescheduled is reported.
 */
export async function resyncNotifications(
  supabase: Client,
  journeyId: string,
  userId: string,
  route: string,
): Promise<void> {
  try {
    await syncJourneyNotifications(supabase, journeyId, userId);
  } catch (error) {
    reportError({ route, error, app: "web" });
  }
}

/** The keys `syncJourneyNotifications` derives, and therefore owns. */
const DERIVED = /^(prepare|tomorrow|leaveby):/;

type ExistingRow = {
  id: string;
  key: string;
  status: string;
  scheduledFor: string | null;
  place: string | null;
};

function matches(row: ExistingRow, draft: NotificationDraft | undefined): boolean {
  if (!draft || row.scheduledFor === null) return false;
  const place = draft.params?.["place"];
  return (
    Date.parse(row.scheduledFor) === Date.parse(draft.scheduledFor) &&
    row.place === (place === undefined ? null : String(place))
  );
}

async function profileLocale(supabase: Client, userId: string): Promise<string> {
  const data = mustMaybe(
    await supabase.from("profiles").select("locale").eq("id", userId).maybeSingle(),
    "profiles",
  );
  return data?.locale && isLocale(data.locale) ? data.locale : "en";
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

/** Every notification already derived for this journey, with what makes one stale. */
async function existingRows(
  service: ReturnType<typeof createServiceRoleSupabase>,
  userId: string,
  journeyId: string,
): Promise<ExistingRow[]> {
  const data = mustList(
    await service
      .from("notifications")
      .select("id, payload, status, scheduled_for")
      .eq("user_id", userId)
      .eq("journey_id", journeyId),
    "notifications",
  );

  return data.flatMap((row) => {
    const payload = (row.payload ?? {}) as {
      dedupeKey?: string;
      params?: Record<string, unknown>;
    };
    if (!payload.dedupeKey) return [];
    const place = payload.params?.["place"];
    return [
      {
        id: row.id,
        key: payload.dedupeKey,
        status: row.status,
        scheduledFor: row.scheduled_for,
        place: place === undefined ? null : String(place),
      },
    ];
  });
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
 * The engine's keys, rendered in the traveler's language (PRD F15, PRD-LANG-001).
 *
 * From the same message catalogs as every screen, so a traveler reading Telugu gets their
 * reminder in Telugu and a missing translation falls back to English rather than a key. The
 * locale is the traveler's own at SEND time, never the one they happened to use when the row
 * was queued. PRD §12.7's voice throughout: no alarm words, and every one says what to do.
 */
const CATALOGS = { en, te, hi } as unknown as Record<string, AbstractIntlMessages>;

export function render(
  key: string | undefined,
  params: Record<string, string | number>,
  locale: string,
): string {
  if (!key?.startsWith("notify.")) return "";

  const has = (name: string) => params[name] !== undefined && String(params[name]) !== "";
  const variant =
    key === "notify.prepare_deadline.body" && has("days")
      ? `${key}_days`
      : key === "notify.journey_tomorrow.body" && has("time")
        ? `${key}_time`
        : key;

  const chosen = lookup(CATALOGS[locale], variant) ? locale : "en";
  const messages = CATALOGS[chosen]!;
  if (!lookup(messages, variant)) return "";

  const translate = createTranslator({ locale: chosen, messages }) as unknown as (
    key: string,
    values: Record<string, string>,
  ) => string;

  return translate(variant, {
    minutes: String(params["minutes"] ?? "15"),
    place: has("place")
      ? String(params["place"])
      : String(lookup(messages, "notify.defaults.next_stop") ?? ""),
    days: String(params["days"] ?? ""),
    time: String(params["time"] ?? ""),
  });
}

function lookup(messages: AbstractIntlMessages | undefined, path: string): unknown {
  let node: unknown = messages;
  for (const part of path.split(".")) {
    if (!node || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" && node !== "" ? node : undefined;
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
