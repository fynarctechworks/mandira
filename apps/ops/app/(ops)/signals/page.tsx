import { getOpsRoles, hasAnyRole } from "@mandhira/db/client/roles";
import { buttonVariants } from "@mandhira/ui/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@mandhira/ui/components/ui/table";
import Link from "next/link";
import { LoadProblem, RoleNotice } from "@/components/load-problem";
import { SignalsChart } from "@/components/signals-chart";
import { formatWhen } from "@/lib/entities";
import { percent } from "@/lib/health";
import {
  DAY_OPTIONS,
  DEPARTURE_STATES,
  dailySeries,
  parseDays,
  per1000,
  type ProductOutcomes,
  type ProductSignals,
} from "@/lib/signals";
import { opsSupabase } from "@/lib/supabase";

export const metadata = { title: "Product signals · Mandhira Ops" };
export const dynamic = "force-dynamic";

/**
 * O22 — Product signals (PRD F20, PRD-OPS-MON-002).
 *
 * Counts by event and by day from `product_signals()`, never event rows: `analytics_events`
 * holds no user id, and a list of events would still be one visit's path through the
 * product (0032). Aggregation is what keeps this a signal and not a person.
 *
 * What journeys did — created, PROTECTED share, health at departure, Change Cards, Live
 * journey-days, report rate — comes from `product_outcomes()` (0048), also counts only.
 */
export default async function SignalsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const days = parseDays((await searchParams).days);
  const supabase = await opsSupabase();
  const roles = await getOpsRoles(supabase);

  const header = (
    <header className="flex flex-col gap-1">
      <h1 className="text-h1">Product signals</h1>
      <p className="text-body text-text-secondary">
        How Mandhira is being used, counted by event and by day. Nothing here identifies a traveler
        or a journey.
      </p>
    </header>
  );

  if (!hasAnyRole(roles, ["admin", "editor", "approver"])) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <RoleNotice>Product signals are available to admins, editors and approvers.</RoleNotice>
      </div>
    );
  }

  const [{ data, error }, outcomesResult] = await Promise.all([
    supabase.rpc("product_signals", { p_days: days }),
    supabase.rpc("product_outcomes", { p_days: days }),
  ]);
  const signals = data as unknown as ProductSignals | null;
  const outcomes = outcomesResult.data as unknown as ProductOutcomes | null;

  return (
    <div className="flex flex-col gap-6">
      {header}

      <nav aria-label="Time window" className="flex gap-1">
        {DAY_OPTIONS.map((option) => (
          <Link
            key={option}
            href={`/signals?days=${option}`}
            aria-current={option === days ? "page" : undefined}
            className={buttonVariants({
              size: "sm",
              variant: option === days ? "default" : "outline",
            })}
          >
            Last {option} days
          </Link>
        ))}
      </nav>

      {outcomesResult.error || !outcomes ? <LoadProblem /> : <Outcomes outcomes={outcomes} />}

      {error || !signals ? (
        <LoadProblem />
      ) : signals.events.length === 0 ? (
        <p className="text-body text-text-secondary">
          No events recorded since {formatWhen(signals.since)}.
        </p>
      ) : (
        <Signals signals={signals} days={days} />
      )}
    </div>
  );
}

function Signals({ signals, days }: { signals: ProductSignals; days: number }) {
  const { series, data } = dailySeries(signals.daily, signals.events, days, new Date());
  const total = signals.events.reduce((sum, event) => sum + event.total, 0);
  const locales = Object.entries(signals.locales).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <SignalsChart
        series={series}
        data={data}
        summary={`${total} events in the last ${days} days, by day, since ${formatWhen(signals.since)}.`}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section aria-labelledby="events-heading" className="flex flex-col gap-2">
          <h2 id="events-heading" className="text-h3">
            Events
          </h2>
          <Table>
            <TableCaption className="sr-only">
              Each event, with how often it happened offline
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Offline</TableHead>
                <TableHead className="text-right">Share offline</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {signals.events.map((event) => (
                <TableRow key={event.event}>
                  <TableCell className="font-mono">{event.event}</TableCell>
                  <TableCell className="text-right tabular-nums">{event.total}</TableCell>
                  <TableCell className="text-right tabular-nums">{event.offline}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {percent(event.offline, event.total)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>

        <section aria-labelledby="signal-locales-heading" className="flex flex-col gap-2">
          <h2 id="signal-locales-heading" className="text-h3">
            By language
          </h2>
          <Table>
            <TableCaption className="sr-only">Events by the app language in use</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Locale</TableHead>
                <TableHead className="text-right">Events</TableHead>
                <TableHead className="text-right">Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {locales.map(([code, count]) => (
                <TableRow key={code}>
                  <TableCell>{code}</TableCell>
                  <TableCell className="text-right tabular-nums">{count}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {percent(count, total)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      </div>
    </>
  );
}

/** PRD F20's journey signals, with PRD §7's targets where it sets one. */
function Outcomes({ outcomes }: { outcomes: ProductOutcomes }) {
  const { journeys, change_cards: cards, live, offline, reports } = outcomes;
  const reportRate = per1000(reports.total, reports.journey_days);
  const validRate = per1000(reports.valid, reports.journey_days);
  const departures = DEPARTURE_STATES.reduce(
    (sum, [state]) => sum + (outcomes.health_at_departure[state] ?? 0),
    0,
  );

  return (
    <>
      <section aria-labelledby="outcomes-heading" className="flex flex-col gap-2">
        <h2 id="outcomes-heading" className="text-h3">
          Journeys
        </h2>
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Figure
            label="Journeys created"
            value={journeys.created}
            note={`${journeys.with_protected} of them have a PROTECTED item.`}
          />
          <Figure
            label="With a PROTECTED and a FIXED item"
            value={`${percent(journeys.with_protected_and_fixed, journeys.created)}%`}
            note="Target: 80% or more."
          />
          <Figure
            label="Change Cards accepted"
            value={`${percent(cards.accepted, cards.shown)}%`}
            note={`${cards.shown} shown, ${cards.kept_as_is} kept as is. ${percent(cards.accepted_within_2_min, cards.shown)}% chosen within 2 minutes; target 60% or more.`}
          />
          <Figure
            label="Journey-days with Live open"
            value={`${percent(live.journey_days_with_live, live.journey_days)}%`}
            note={`${live.journey_days_with_live} of ${live.journey_days} journey-days. ${live.opened_offline} of ${live.opened} opens were offline.`}
          />
          <Figure
            label="Read offline"
            value={offline.renders}
            note={`Times a saved copy was shown with no connection. ${offline.events} events happened offline.`}
          />
          <Figure
            label="Reports per 1,000 journey-days"
            value={reportRate ?? "No journey-days yet"}
            note={
              validRate === null
                ? `${reports.total} reports.`
                : `${validRate} led to an update; target 5 or fewer.`
            }
          />
        </dl>
      </section>

      <section aria-labelledby="departure-heading" className="flex flex-col gap-2">
        <h2 id="departure-heading" className="text-h3">
          Health at departure
        </h2>
        {departures === 0 ? (
          <p className="text-body text-text-secondary">No journeys have set off in this window.</p>
        ) : (
          <Table>
            <TableCaption className="sr-only">
              Journey Health on the day each journey became active
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Health</TableHead>
                <TableHead className="text-right">Journeys</TableHead>
                <TableHead className="text-right">Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {DEPARTURE_STATES.map(([state, label]) => {
                const count = outcomes.health_at_departure[state] ?? 0;
                return (
                  <TableRow key={state}>
                    <TableCell>{label}</TableCell>
                    <TableCell className="text-right tabular-nums">{count}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {percent(count, departures)}%
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>
    </>
  );
}

function Figure({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-card border border-border-subtle p-4">
      <dt className="text-body-sm text-text-secondary">{label}</dt>
      <dd className="text-h2 tabular-nums">{value}</dd>
      <dd className="text-caption text-text-secondary">{note}</dd>
    </div>
  );
}
