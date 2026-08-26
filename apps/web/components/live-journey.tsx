"use client";

import { HealthPill, NowCard, TierChip } from "@mandhira/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { LiveItemView, LiveView } from "../lib/live-view";
import { readLiveViewLocally } from "../lib/offline/live-local";
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
  const journeyId = serverView?.journeyId ?? "";

  const {
    data: localView,
    changed,
    dismissChanged,
  } = useOfflineFirst<LiveView>({
    key: journeyId,
    revalidate: () => syncJourneyOffline(journeyId, locale),
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

    const response = await fetch(`/api/journeys/${journeyId}/items/${itemId}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...(extraMinutes ? { extraMinutes } : {}) }),
    });

    const payload = await response.json().catch(() => ({ ok: false }));
    if (!payload.ok) setProblem("That didn't save. Please try again.");

    setPending(false);
    router.refresh();

    // Keep the snapshot in step, so the offline copy reflects what just happened rather
    // than waiting for the next revalidation tick to notice.
    await syncJourneyOffline(journeyId, locale);
    const local = await readLiveViewLocally(journeyId, locale, new Date().toISOString());
    if (local) setManualView(local);
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
