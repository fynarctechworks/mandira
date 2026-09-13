import { getOpsRoles, hasAnyRole } from "@mandhira/db/client/roles";
import { Button } from "@mandhira/ui/components/ui/button";
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
import { DAY_OPTIONS, dailySeries, parseDays, type ProductSignals } from "@/lib/signals";
import { opsSupabase } from "@/lib/supabase";

export const metadata = { title: "Product signals · Mandhira Ops" };
export const dynamic = "force-dynamic";

/**
 * O22 — Product signals (PRD F20, PRD-OPS-MON-002).
 *
 * Counts by event and by day from `product_signals()`, never event rows: `analytics_events`
 * holds no user id, and a list of events would still be one visit's path through the
 * product (0032). Aggregation is what keeps this a signal and not a person.
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

  const { data, error } = await supabase.rpc("product_signals", { p_days: days });
  const signals = data as unknown as ProductSignals | null;

  return (
    <div className="flex flex-col gap-6">
      {header}

      <nav aria-label="Time window" className="flex gap-1">
        {DAY_OPTIONS.map((option) => (
          <Button
            key={option}
            size="sm"
            variant={option === days ? "default" : "outline"}
            nativeButton={false}
            render={
              <Link
                href={`/signals?days=${option}`}
                aria-current={option === days ? "page" : undefined}
              />
            }
          >
            Last {option} days
          </Button>
        ))}
      </nav>

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
