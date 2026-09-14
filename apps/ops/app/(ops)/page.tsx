import { Badge } from "@mandhira/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@mandhira/ui/components/ui/card";
import { Progress } from "@mandhira/ui/components/ui/progress";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@mandhira/ui/components/ui/table";
import { CircleCheckIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { LoadProblem } from "@/components/load-problem";
import { PublishStatusTag } from "@/components/publish-status-tag";
import { ageOf, formatWhen } from "@/lib/entities";
import { everyLabel, percent, queueRows, type KnowledgeHealth } from "@/lib/health";
import { opsSupabase } from "@/lib/supabase";

export const metadata = { title: "Home · Mandhira Ops" };

/**
 * O01 — Knowledge health (PRD F20, PRD-OPS-MON-001).
 *
 * One call to `knowledge_health()`, so every figure on the screen was read in the same
 * instant and none of them can disagree with another.
 */
export default async function OpsHomePage() {
  const supabase = await opsSupabase();
  const { data, error } = await supabase.rpc("knowledge_health");

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-h1">Operations</h1>
        <p className="text-body text-text-secondary">
          How the knowledge behind Mandhira is holding up: what is going stale, what is waiting on
          somebody, and where each destination is thin.
        </p>
      </header>

      {error || !data ? <LoadProblem /> : <Dashboard health={data as unknown as KnowledgeHealth} />}
    </div>
  );
}

function Dashboard({ health }: { health: KnowledgeHealth }) {
  const { trust } = health;
  const queues = queueRows(health.queues);
  const attention = health.jobs.filter((job) => job.needs_attention);

  return (
    <>
      <p className="-mt-6 text-caption text-text-tertiary">
        Read {formatWhen(health.generated_at)}
      </p>

      <section aria-labelledby="trust-heading" className="flex flex-col gap-3">
        <h2 id="trust-heading" className="text-h3">
          Trust
        </h2>
        {trust.total === 0 ? (
          <p className="text-body-sm text-text-secondary">
            No trust records yet. They appear as critical fields are reviewed against sources.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader>
                <CardTitle>Freshness</CardTitle>
                <CardDescription>{trust.total} trust records</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {(
                  [
                    ["Fresh", trust.fresh],
                    ["Aging", trust.aging],
                    ["Stale", trust.stale],
                  ] as const
                ).map(([label, count]) => (
                  <div key={label} className="flex flex-col gap-1">
                    <div className="flex justify-between text-body-sm">
                      <span>{label}</span>
                      <span className="tabular-nums">
                        {count} · {percent(count, trust.total)}%
                      </span>
                    </div>
                    <Progress value={percent(count, trust.total)} aria-label={`${label} records`} />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Figure
              title="Stale"
              value={trust.stale}
              href="/freshness?filter=stale"
              note="Checked more than six months ago, or past the date its source vouched for."
              warn={trust.stale > 0}
            />
            <Figure
              title="Low confidence"
              value={trust.low_confidence}
              href="/freshness?filter=low"
              note={`${trust.unverified} not yet reviewed by a person.`}
              warn={trust.low_confidence > 0}
            />
            <Figure
              title="Sources disagree"
              value={trust.conflicted}
              href="/conflicts"
              note="Fields carrying a conflict flag, shown to travelers as uncertain."
              warn={trust.conflicted > 0}
            />
          </div>
        )}
      </section>

      <section aria-labelledby="queues-heading" className="flex flex-col gap-3">
        <h2 id="queues-heading" className="text-h3">
          Queues
        </h2>
        <Table>
          <TableCaption className="sr-only">Open work and how long it has waited</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Queue</TableHead>
              <TableHead className="text-right">Open</TableHead>
              <TableHead>Oldest</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {queues.map((queue) => (
              <TableRow key={queue.key}>
                <TableCell>
                  <Link href={queue.href} className="focus-ring font-medium underline">
                    {queue.label}
                  </Link>
                </TableCell>
                <TableCell className="text-right tabular-nums">{queue.open}</TableCell>
                <TableCell className="text-text-secondary">
                  {queue.open === 0 || !queue.at ? (
                    "—"
                  ) : queue.kind === "due" ? (
                    `Next ${formatWhen(queue.at)}`
                  ) : (
                    <span className="inline-flex flex-wrap items-center gap-2">
                      {`Waiting ${ageOf(queue.at)}`}
                      {/* TRD §11: past seven days the admins are emailed too (0046). */}
                      {Date.parse(queue.at) < Date.now() - 7 * 86_400_000 ? (
                        <span className="rounded-full border border-status-broken px-2 py-0.5 text-caption font-medium text-status-broken">
                          Over 7 days
                        </span>
                      ) : null}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section aria-labelledby="locales-heading" className="flex flex-col gap-3">
        <h2 id="locales-heading" className="text-h3">
          Locale completeness
        </h2>
        <p className="text-body-sm text-text-secondary">
          Published destinations, places and experiences with a name in each active language.
        </p>
        <Table>
          <TableCaption className="sr-only">Published content named in each locale</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Locale</TableHead>
              <TableHead className="text-right">Named</TableHead>
              <TableHead className="w-1/2">Coverage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {health.locales.map((locale) => {
              const share = percent(locale.translated, locale.published);
              return (
                <TableRow key={locale.code}>
                  <TableCell>
                    <Link href="/translations" className="focus-ring underline">
                      {locale.name}
                    </Link>{" "}
                    <span className="text-text-tertiary">{locale.code}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {locale.translated} of {locale.published}
                  </TableCell>
                  <TableCell>
                    <Progress value={share} aria-label={`${locale.name} coverage ${share}%`} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>

      <section aria-labelledby="depth-heading" className="flex flex-col gap-3">
        <h2 id="depth-heading" className="text-h3">
          Destinations by depth
        </h2>
        {health.destinations.length === 0 ? (
          <p className="text-body-sm text-text-secondary">
            No destinations yet.{" "}
            <Link href="/destinations/new" className="underline">
              Create one
            </Link>{" "}
            to start.
          </p>
        ) : (
          <Table>
            <TableCaption className="sr-only">Published content per destination</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Destination</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Places</TableHead>
                <TableHead className="text-right">Experiences</TableHead>
                <TableHead className="text-right">Routes</TableHead>
                <TableHead className="text-right">Advisories</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {health.destinations.map((destination) => (
                <TableRow key={destination.id}>
                  <TableCell>
                    <Link
                      href={`/destinations/${destination.id}`}
                      className="focus-ring font-medium underline"
                    >
                      {destination.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <PublishStatusTag status={destination.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{destination.places}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {destination.experiences}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{destination.routes}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {destination.advisories}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section aria-labelledby="jobs-heading" className="flex flex-col gap-3">
        <h2 id="jobs-heading" className="text-h3">
          Scheduled jobs
        </h2>
        <p className="text-body-sm text-text-secondary">
          {attention.length === 0
            ? "Every job ran on time and succeeded."
            : `${attention.length} ${attention.length === 1 ? "job needs" : "jobs need"} attention: missed two runs in a row, or the last run did not succeed.`}
        </p>
        <Table>
          <TableCaption className="sr-only">Background jobs and their last run</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Job</TableHead>
              <TableHead>Runs</TableHead>
              <TableHead>Last run</TableHead>
              <TableHead>State</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {health.jobs.map((job) => (
              <TableRow key={job.job_name}>
                <TableCell className="font-mono">{job.job_name}</TableCell>
                <TableCell>{everyLabel(job.interval_seconds)}</TableCell>
                <TableCell>
                  {job.last_run_at
                    ? `${formatWhen(job.last_run_at)} · ${job.last_status ?? "unknown"}`
                    : "Never"}
                </TableCell>
                <TableCell>
                  {job.needs_attention ? (
                    <Badge variant="destructive">
                      <TriangleAlertIcon aria-hidden="true" />
                      {job.missed_two_windows ? "Missed runs" : "Last run did not succeed"}
                    </Badge>
                  ) : (
                    <Badge variant="outline">
                      <CircleCheckIcon aria-hidden="true" />
                      On schedule
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </>
  );
}

function Figure({
  title,
  value,
  note,
  href,
  warn,
}: {
  title: string;
  value: number;
  note: string;
  href: string;
  warn: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Link href={href} className="focus-ring underline">
            {title}
          </Link>
        </CardTitle>
        <CardDescription>{note}</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-2">
        {warn ? (
          <TriangleAlertIcon aria-hidden="true" className="size-5 text-destructive" />
        ) : (
          <CircleCheckIcon aria-hidden="true" className="size-5 text-muted-foreground" />
        )}
        <span className="text-h2 tabular-nums">{value}</span>
        <span className="sr-only">{warn ? "needs attention" : "none"}</span>
      </CardContent>
    </Card>
  );
}
