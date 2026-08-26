"use client";

import { HealthPill, NowCard, TierChip } from "@mandhira/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { ChangeCard } from "@mandhira/journey-engine";

import type { LiveItemView, LiveView } from "../lib/live-view";
import { ChangeSheet } from "./change-sheet";
import { readLiveViewLocally } from "../lib/offline/live-local";
import { enqueue, flushOutbox, pendingCount } from "../lib/offline/outbox";
import { replanLocally } from "../lib/offline/replan-local";
import { syncJourneyOffline } from "../lib/offline/sync";
import { useOfflineFirst } from "../lib/offline/use-offline-first";
import { OfflineNotice } from "./offline-notice";
import { OpenInMaps } from "./open-in-maps";

/**
 * Live Journey — NOW / NEXT / LATER (PRD F8, LIVE-01..04).
 *
 * One scroll, no tabs, no calendar grid (PRD-LIVE-006). Three questions in the order a
 * traveler standing somewhere actually asks them: what am I doing, when do I leave, what
 * is after that.
 *
 * A CLIENT component for one reason — the clock. The engine has no clock by design (D-005)
 * and the projection is computed on the server, so left alone this screen would show 9:40
 * for as long as the tab stayed open. Here the countdown is re-derived locally every
 * second from instants the server already sent, and the server projection is refreshed
 * each minute. Nothing about the plan is decided here; only how long until it.
 */
const TIER_CHIP = {
  fixed: "FIXED",
  protected: "PROTECTED",
  important: "IMPORTANT",
  optional: "OPTIONAL",
} as const;

export function LiveJourney({
  view: serverView,
  locale,
}: {
  view: LiveView | null;
  locale: string;
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  /*
   * The view the screen actually renders.
   *
   * The server's is the first paint and nothing more. This component RECOMPUTES from
   * IndexedDB against the live clock — online and offline alike — because a NOW card is
   * only right for about a minute, and a cached page showing yesterday's projection reads
   * exactly like a live one. That is the single most dangerous failure this screen has.
   */
  const [manualView, setManualView] = useState<LiveView | null>(null);

  /*
   * The Change Card, when one is offered (PRD F6, B-026).
   *
   * Held here rather than fetched by the sheet, because the card is EVALUATED at the moment
   * the traveler said they were running late and answered a few seconds later. Re-fetching
   * on open would show them options computed against a journey that had already moved.
   */
  const [change, setChange] = useState<{
    id: string | null;
    card: ChangeCard;
    offline: boolean;
  } | null>(null);
  const [quiet, setQuiet] = useState<string | null>(null);
  /** How many actions are waiting to be sent (PRD-OFFL-004). */
  const [queued, setQueued] = useState(0);
  const journeyId = serverView?.journeyId ?? "";

  const {
    data: localView,
    changed,
    dismissChanged,
  } = useOfflineFirst<LiveView>({
    key: journeyId,
    /*
     * The outbox drains HERE, on the revalidation path — not only after an action.
     *
     * Getting that wrong is subtle and total: with the flush only in `reproject`, a
     * traveler who marked something done offline and then closed the app would come back
     * with a signal, see everything look normal, and never send it. The queue only moved
     * if they happened to tap something else. `useOfflineFirst` runs on mount, on a timer,
     * and on the browser's `online` event, which is exactly when a queue should drain.
     */
    revalidate: async () => {
      const flushed = await flushOutbox();
      if (flushed.sent > 0 || flushed.dropped > 0) setQueued(await pendingCount());

      return syncJourneyOffline(journeyId, locale);
    },
    read: () => readLiveViewLocally(journeyId, locale, new Date().toISOString()),
  });

  const view = manualView ?? localView ?? serverView;

  useEffect(() => {
    // A second is enough to keep "in 4 minutes" honest without re-rendering constantly.
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  /*
   * Nothing from the server and nothing stored: a first visit with no network. Said
   * plainly rather than rendered as an empty screen that looks broken.
   */
  if (!view) {
    return (
      <p className="text-body text-text-secondary">
        This journey hasn&apos;t been saved for offline use yet. Open it once with a connection and
        it&apos;ll be here next time.
      </p>
    );
  }

  async function act(itemId: string, action: string, extraMinutes?: number) {
    setPending(true);
    setProblem(null);

    const body = { action, ...(extraMinutes ? { extraMinutes } : {}) };

    try {
      const response = await fetch(`/api/journeys/${journeyId}/items/${itemId}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload = await response.json().catch(() => ({ ok: false }));
      if (!payload.ok) setProblem("That didn't save. Please try again.");
    } catch {
      /*
       * No network (PRD-OFFL-004). Queued and sent on reconnect — and NOT reported as a
       * problem, because from the traveler's side nothing went wrong: they marked
       * something done on a hillside and it will reach us when there is signal.
       */
      await enqueue("item_status_update", { journeyId, itemId, ...body });
      setQueued(await pendingCount());
    }

    setPending(false);
    router.refresh();

    // Keep the snapshot in step, so the offline copy reflects what just happened rather
    // than waiting for the next revalidation tick to notice.
    await reproject();

    /*
     * Running late or staying longer means the plan no longer matches reality, so this is
     * the moment to ask whether anything can be done about it (PRD F6).
     *
     * "Done" deliberately does not trigger it: finishing something roughly on time is not
     * a change worth interrupting anyone over.
     */
    if (action === "running_late" || action === "stay_longer") {
      await offerOptions(action, extraMinutes ?? 15);
    }
  }

  /**
   * Re-read the local snapshot after a write, rather than waiting for the next tick.
   *
   * Anything queued goes FIRST, so the snapshot that follows reflects it. Flushing after
   * the sync would fetch a server state that does not yet know about the item the traveler
   * marked done on a hillside, and then overwrite the local copy with it — losing the very
   * thing the outbox exists to protect.
   */
  async function reproject() {
    const flushed = await flushOutbox();
    if (flushed.sent > 0) setQueued(await pendingCount());

    await syncJourneyOffline(journeyId, locale);
    const local = await readLiveViewLocally(journeyId, locale, new Date().toISOString());
    if (local) setManualView(local);
  }

  /**
   * Ask the engine what could be done, and show it — or say almost nothing.
   *
   * PRD-ADPT-005: a `no_impact` outcome gets a quiet line, never a card. Interrupting
   * someone to tell them nothing needs to change is exactly how they learn to dismiss the
   * card that does matter.
   */
  async function offerOptions(action: string, extraMinutes: number) {
    setQuiet(null);

    // Declared before the null guard in the render below, so it has to check for itself.
    // There is nothing to replan against without a view.
    const current = manualView ?? localView ?? serverView;
    if (!current) return;

    const trigger = {
      kind: (action === "running_late" ? "user_late" : "user_stay_longer") as
        "user_late" | "user_stay_longer",
      dayIndex: current.projection.dayIndex,
      deltaMinutes: extraMinutes,
      ...(current.now.itemId ? { itemId: current.now.itemId } : {}),
    };

    let card: ChangeCard | null = null;
    let eventId: string | null = null;

    try {
      const response = await fetch(`/api/journeys/${journeyId}/changes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(trigger),
      });

      const payload = await response.json().catch(() => ({ ok: false }));
      if (payload.ok) {
        card = payload.data.card as ChangeCard;
        eventId = payload.data.id as string;
      }
    } catch {
      /*
       * No network — and this is the case the whole engine was kept pure for
       * (PRD-OFFL-005, PRD-ADPT-007). Someone on a hillside forty minutes behind needs to
       * know whether the evening aarti is still reachable, and that is answerable from the
       * snapshot already on the device.
       */
      card = await replanLocally(journeyId, trigger, new Date().toISOString());
    }

    if (!card) return;

    if (card.outcome === "no_impact" || !card.recommended) {
      setQuiet("That still fits — nothing else needs to move.");
      return;
    }

    /*
     * `eventId` is null when this was computed offline: there is no server row to answer
     * yet. The decision is queued instead (see `decide`), and the card says so — a
     * traveler should know their choice is waiting rather than applied.
     */
    setChange({ id: eventId, card, offline: eventId === null });
  }

  /** The tap. The only thing in this product that rearranges a journey. */
  async function decide(optionId: string | null) {
    if (!change) return;

    setPending(true);
    setProblem(null);

    if (change.offline || !change.id) {
      /*
       * Computed offline, so there is no server row to answer. The decision is queued and
       * replayed in order on reconnect — after the item-status update that triggered it,
       * which is precisely why the outbox preserves the order actions were taken in.
       */
      await enqueue("change_decision", { journeyId, eventId: change.id ?? "", optionId });
      setQueued(await pendingCount());
    } else {
      try {
        const response = await fetch(`/api/journeys/${journeyId}/changes/${change.id}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ optionId }),
        });

        const payload = await response.json().catch(() => ({ ok: false }));
        if (!payload.ok) setProblem("That didn't save. Please try again.");
      } catch {
        // Signal went while the sheet was open. Queued rather than lost.
        await enqueue("change_decision", { journeyId, eventId: change.id, optionId });
        setQueued(await pendingCount());
      }
    }

    setChange(null);
    setPending(false);
    router.refresh();
    await reproject();
  }

  const { projection, now: nowView } = view;
  const kind = projection.now.kind;

  return (
    <div className="flex flex-col gap-6">
      {/* PRD F8: the health pill is pinned, and tapping it gives the causes. */}
      <div className="sticky top-0 z-10 -mx-4 flex items-center gap-3 bg-bg-canvas px-4 py-2">
        <HealthPill state={projection.dayState} />
        {view.dayCauses.length > 0 ? (
          <details className="min-w-0 flex-1">
            <summary className="focus-ring min-h-11 cursor-pointer list-none text-body-sm text-brand-primary-text">
              Why?
            </summary>
            <ul className="mt-1 flex flex-col gap-1">
              {view.dayCauses.map((cause) => (
                <li key={cause} className="text-body-sm text-text-secondary">
                  {cause}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      {/*
        PRD-OFFL-003 allows exactly one card about what changed while the traveler was
        away, and forbids a sync-error dialog entirely. This is that card.
      */}
      <OfflineNotice syncedAt={view.syncedAt} changed={changed} onDismiss={dismissChanged} />

      {problem ? (
        <p role="alert" className="text-body-sm text-status-broken">
          {problem}
        </p>
      ) : null}

      {/*
        What is waiting to be sent (PRD-OFFL-004). Stated as a fact, not a warning: the
        traveler did the thing, and it will reach us. There is nothing for them to do, and
        PRD-OFFL-003 forbids presenting it as a failure.
      */}
      {queued > 0 ? (
        <p role="status" className="text-caption text-text-secondary">
          {queued === 1 ? "One change" : `${queued} changes`} saved on this device, waiting for a
          signal.
        </p>
      ) : null}

      {/* PRD-ADPT-005's quiet half: said once, in passing, with nothing to dismiss. */}
      {quiet ? (
        <p role="status" className="text-body-sm text-text-secondary">
          {quiet}
        </p>
      ) : null}

      {change ? (
        <ChangeSheet
          card={change.card}
          open
          offline={change.offline}
          pending={pending}
          onDecide={(optionId) => void decide(optionId)}
          onOpenChange={(next) => {
            // Closing without choosing is not a decision. The card stays unanswered in
            // `journey_change_events` and the plan is untouched.
            if (!next) setChange(null);
          }}
        />
      ) : null}

      {/* ── NOW ─────────────────────────────────────────────────────────────── */}
      <NowCard
        eyebrow={kind === "day_complete" ? "Today" : "Now"}
        title={nowView.label}
        detail={nowDetail(view, now)}
        trailing={nowView.tier ? <TierChip tier={TIER_CHIP[nowView.tier]} readOnly /> : undefined}
        /*
         * Exactly three, and only on a real item. PRD-LIVE-006 caps any card at three
         * actions; offering "Done" on a travel leg or on free time would be offering to
         * complete something that is not a task.
         */
        actions={
          kind === "item" && nowView.itemId && !pending
            ? [
                {
                  label: "Done",
                  variant: "primary" as const,
                  onClick: () => void act(nowView.itemId!, "done"),
                },
                {
                  label: "Running late",
                  onClick: () => void act(nowView.itemId!, "running_late", 15),
                },
                {
                  label: "Stay longer",
                  onClick: () => void act(nowView.itemId!, "stay_longer", 30),
                },
              ]
            : []
        }
      />

      {kind === "item" && nowView.isDone ? (
        <button
          type="button"
          onClick={() => nowView.itemId && void act(nowView.itemId, "reopen")}
          className="focus-ring min-h-11 self-start px-2 text-body-sm text-brand-primary-text"
        >
          Actually, not done yet
        </button>
      ) : null}

      {/* ── NEXT ────────────────────────────────────────────────────────────── */}
      {view.next ? (
        <section aria-labelledby="next" className="flex flex-col gap-2">
          <h2 id="next" className="text-h2">
            Next
          </h2>

          <div className="flex flex-col gap-3 rounded-card border border-border bg-bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-h3">{view.next.label}</h3>
                {view.next.place ? (
                  <p className="text-body-sm text-text-secondary">{view.next.place.name}</p>
                ) : null}
              </div>
              {view.next.tier ? <TierChip tier={TIER_CHIP[view.next.tier]} readOnly /> : null}
            </div>

            {/*
             * Departure-by, said as a time and not only as a countdown. "Leave by 9:15" is
             * something a traveler can hold in their head while their phone is in a pocket;
             * "in 23 minutes" stops being true the moment they look away.
             */}
            {projection.leaveByAt ? (
              <p className="text-body font-medium">
                Leave by {clock(projection.leaveByAt, locale)}
                <span className="font-normal text-text-secondary">
                  {" "}
                  · {relative(projection.leaveByAt, now)}
                </span>
              </p>
            ) : null}

            {projection.now.travelMinutes ? (
              <p className="text-body-sm text-text-secondary">
                About {projection.now.travelMinutes} minutes to get there.
              </p>
            ) : null}

            {view.next.place?.latitude != null && view.next.place.longitude != null ? (
              <OpenInMaps
                latitude={view.next.place.latitude}
                longitude={view.next.place.longitude}
                label={view.next.place.name}
              />
            ) : null}
          </div>
        </section>
      ) : null}

      {/* ── LATER ───────────────────────────────────────────────────────────── */}
      {view.later.length > 0 ? (
        <section aria-labelledby="later" className="flex flex-col gap-2">
          <h2 id="later" className="text-h2">
            Later today
          </h2>

          {/* Compact by design (PRD-LIVE-003): a time window, a name, a tier. */}
          <ul className="flex flex-col rounded-lg border border-border bg-bg-surface">
            {view.later.map((row) => (
              <li
                key={row.itemId}
                className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-body">{row.label}</p>
                  <p className="text-caption text-text-secondary">{window_(row, locale)}</p>
                </div>
                <TierChip tier={TIER_CHIP[row.tier]} readOnly />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ── End of day (PRD-LIVE-004) ───────────────────────────────────────── */}
      {kind === "day_complete" ? (
        <section aria-labelledby="tomorrow" className="flex flex-col gap-2">
          <h2 id="tomorrow" className="text-h2">
            Tomorrow
          </h2>

          {view.tomorrowFirst ? (
            <div className="flex flex-col gap-1 rounded-card border border-border bg-bg-surface p-4">
              <p className="text-body">
                Starts with {view.tomorrowFirst.label}
                {view.tomorrowFirst.startAt
                  ? ` at ${clock(view.tomorrowFirst.startAt, locale)}`
                  : ""}
                .
              </p>
              <a
                href={`/${locale}/journeys/${view.journeyId}/prepare`}
                className="focus-ring min-h-11 self-start py-2 text-body-sm font-medium text-brand-primary-text"
              >
                Anything to prepare tonight?
              </a>
            </div>
          ) : (
            <p className="text-body text-text-secondary">
              That&apos;s the last day of this journey.
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}

/** The sentence under the NOW title, which differs completely by state. */
function nowDetail(view: LiveView, now: number): string {
  const { projection } = view;
  const place = view.now.place?.name;

  switch (projection.now.kind) {
    case "item": {
      const until = projection.now.endAt ? relative(projection.now.endAt, now) : null;
      // PRD F8's "time guidance": when to be finished, not how long it has been.
      return [place, until ? `Aim to be done ${until}` : null].filter(Boolean).join(" · ");
    }
    case "travel":
      return projection.now.travelMinutes
        ? `About ${projection.now.travelMinutes} minutes on the way.`
        : "On your way.";
    case "free":
      return projection.leaveByAt
        ? `Next departure ${relative(projection.leaveByAt, now)}.`
        : "Nothing scheduled right now.";
    case "before_day":
      return projection.next?.startAt
        ? `Your first thing starts ${relative(projection.next.startAt, now)}.`
        : "Nothing scheduled yet.";
    case "day_complete":
      return "Everything you planned for today is behind you.";
  }
}

/** "in 12 minutes" / "25 minutes ago" — never a bare timestamp for something imminent. */
function relative(instant: string, now: number): string {
  const minutes = Math.round((Date.parse(instant) - now) / 60_000);
  const abs = Math.abs(minutes);

  if (abs < 1) return "now";

  const said =
    abs < 60
      ? `${abs} minute${abs === 1 ? "" : "s"}`
      : `${Math.floor(abs / 60)} h ${abs % 60 ? `${abs % 60} m` : ""}`.trim();

  return minutes > 0 ? `in ${said}` : `${said} ago`;
}

function clock(instant: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(
    new Date(instant),
  );
}

function window_(row: LiveItemView, locale: string): string {
  if (!row.startAt) return "Not scheduled";
  const from = clock(row.startAt, locale);
  return row.endAt ? `${from} — ${clock(row.endAt, locale)}` : from;
}
