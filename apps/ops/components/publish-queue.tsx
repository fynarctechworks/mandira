"use client";

import { Badge } from "@mandhira/ui/components/ui/badge";
import { Button } from "@mandhira/ui/components/ui/button";
import { Calendar } from "@mandhira/ui/components/ui/calendar";
import { Input } from "@mandhira/ui/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@mandhira/ui/components/ui/popover";
import { CalendarClockIcon, CircleCheckIcon, CircleDotIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import {
  cancelScheduledPublish,
  publishEntity,
  schedulePublish,
} from "@/app/(ops)/publish/actions";
import { ageOf, entityNoun, formatWhen } from "@/lib/entities";
import type { PublishCandidate, ScheduleRow } from "@/lib/publish-queue";

type Outcome = { ok: true } | { ok: false; error: { message: string } };

/**
 * O13 — Approve & publish (PRD F18, PRD-OPS-WF-004).
 *
 * Publish now or at a chosen time. Both go through the same SQL rules, so an item that is
 * blocked here is blocked however it is attempted.
 */
export function PublishQueue({
  candidates,
  schedules,
  canPublish,
}: {
  candidates: PublishCandidate[];
  schedules: ScheduleRow[];
  canPublish: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const scheduledIds = new Set(
    schedules.filter((s) => s.status === "scheduled").map((s) => `${s.table}:${s.entityId}`),
  );
  const ready = candidates.filter((c) => c.problems.length === 0);
  const blocked = candidates.filter((c) => c.problems.length > 0);
  const upcoming = schedules.filter((s) => s.status === "scheduled");
  const failed = schedules.filter((s) => s.status === "blocked");

  function run(key: string, action: () => Promise<Outcome>, done: string) {
    setBusy(key);
    setMessage(null);
    setProblem(null);
    startTransition(async () => {
      const result = await action();
      setBusy(null);
      if (!result.ok) {
        setProblem(result.error.message);
        return;
      }
      setMessage(done);
      router.refresh();
    });
  }

  const target = (c: PublishCandidate) => ({ entity_table: c.table, entity_id: c.id });

  return (
    <div className="flex flex-col gap-8">
      {!canPublish ? (
        <p className="text-body-sm text-text-secondary">
          Publishing and scheduling need the approver role. You can see what is waiting and why.
        </p>
      ) : null}

      <div aria-live="polite" className="min-h-5">
        {message ? <p className="text-body-sm text-text-secondary">{message}</p> : null}
        {problem ? (
          <p role="alert" className="text-body-sm text-destructive">
            {problem}
          </p>
        ) : null}
      </div>

      <section aria-labelledby="ready-heading" className="flex flex-col gap-2">
        <h2 id="ready-heading" className="text-h3">
          Ready to publish ({ready.length})
        </h2>
        {ready.length === 0 ? (
          <p className="text-body-sm text-text-secondary">Nothing is fully ready yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {ready.map((candidate) => {
              const key = `${candidate.table}:${candidate.id}`;
              return (
                <CandidateItem key={key} candidate={candidate}>
                  <p className="flex items-center gap-1 text-body-sm">
                    <CircleCheckIcon aria-hidden="true" className="size-4" />
                    Nothing blocking
                    {scheduledIds.has(key) ? (
                      <span className="text-text-secondary"> · already scheduled</span>
                    ) : null}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={!canPublish || (pending && busy === key)}
                      onClick={() =>
                        run(
                          key,
                          () => publishEntity(target(candidate)),
                          `${candidate.label} is published.`,
                        )
                      }
                    >
                      Publish now
                    </Button>
                    <ScheduleControl
                      label={candidate.label}
                      disabled={!canPublish || (pending && busy === key)}
                      onSchedule={(iso) =>
                        run(
                          key,
                          () => schedulePublish({ ...target(candidate), publish_at: iso }),
                          `${candidate.label} will be published ${formatWhen(iso)}.`,
                        )
                      }
                    />
                  </div>
                </CandidateItem>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="blocked-heading" className="flex flex-col gap-2">
        <h2 id="blocked-heading" className="text-h3">
          Still blocked ({blocked.length})
        </h2>
        {blocked.length === 0 ? (
          <p className="text-body-sm text-text-secondary">Nothing in review is blocked.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {blocked.map((candidate) => (
              <CandidateItem key={`${candidate.table}:${candidate.id}`} candidate={candidate}>
                <ul className="flex flex-col gap-0.5">
                  {candidate.problems.map((item) => (
                    <li
                      key={`${item.field}:${item.message}`}
                      className="flex items-start gap-1 text-body-sm text-text-secondary"
                    >
                      <CircleDotIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                      <span>
                        <span className="font-mono">{item.field}</span>: {item.message}
                      </span>
                    </li>
                  ))}
                </ul>
              </CandidateItem>
            ))}
          </ul>
        )}
      </section>

      <section id="scheduled" aria-labelledby="scheduled-heading" className="flex flex-col gap-2">
        <h2 id="scheduled-heading" className="text-h3">
          Scheduled ({upcoming.length})
        </h2>
        <p className="text-body-sm text-text-secondary">
          Checked every five minutes. Each one is validated again when its time comes.
        </p>
        {upcoming.length === 0 ? (
          <p className="text-body-sm text-text-secondary">Nothing is scheduled.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {upcoming.map((schedule) => (
              <li
                key={schedule.id}
                className="flex flex-wrap items-center justify-between gap-2 border border-border-subtle bg-surface p-3"
              >
                <div>
                  <ScheduleName schedule={schedule} />
                  <p className="flex items-center gap-1 text-body-sm text-text-secondary">
                    <CalendarClockIcon aria-hidden="true" className="size-4" />
                    Publishes {formatWhen(schedule.publishAt)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canPublish || (pending && busy === schedule.id)}
                  onClick={() =>
                    run(
                      schedule.id,
                      () => cancelScheduledPublish({ schedule_id: schedule.id }),
                      `The schedule for ${schedule.label} is cancelled. It stays in review.`,
                    )
                  }
                >
                  Cancel schedule
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {failed.length > 0 ? (
        <section aria-labelledby="failed-heading" className="flex flex-col gap-2">
          <h2 id="failed-heading" className="text-h3">
            Did not go out ({failed.length})
          </h2>
          <ul className="flex flex-col gap-2">
            {failed.map((schedule) => (
              <li
                key={schedule.id}
                className="flex flex-col gap-1 border border-border-subtle bg-surface p-3"
              >
                <ScheduleName schedule={schedule} />
                <p className="flex items-start gap-1 text-body-sm">
                  <TriangleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  Was due {formatWhen(schedule.publishAt)}. {schedule.reason}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function CandidateItem({
  candidate,
  children,
}: {
  candidate: PublishCandidate;
  children: React.ReactNode;
}) {
  return (
    <li className="flex flex-col gap-2 border border-border-subtle bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        {candidate.href ? (
          <Link href={candidate.href} className="focus-ring font-medium underline">
            {candidate.label}
          </Link>
        ) : (
          <span className="font-medium">{candidate.label}</span>
        )}
        <Badge variant="outline">{entityNoun(candidate.table)}</Badge>
        <span className="text-caption text-text-tertiary">
          In review for {ageOf(candidate.inReviewSince)}
        </span>
      </div>
      {children}
    </li>
  );
}

function ScheduleName({ schedule }: { schedule: ScheduleRow }) {
  return (
    <p className="flex flex-wrap items-center gap-2">
      {schedule.href ? (
        <Link href={schedule.href} className="focus-ring font-medium underline">
          {schedule.label}
        </Link>
      ) : (
        <span className="font-medium">{schedule.label}</span>
      )}
      <Badge variant="outline">{entityNoun(schedule.table)}</Badge>
    </p>
  );
}

/** A date from the calendar and a time of day, combined in the operator's own timezone. */
function ScheduleControl({
  label,
  disabled,
  onSchedule,
}: {
  label: string;
  disabled: boolean;
  onSchedule: (iso: string) => void;
}) {
  const id = useId();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<Date | undefined>(tomorrow);
  const [time, setTime] = useState("09:00");
  const [problem, setProblem] = useState<string | null>(null);

  function confirm() {
    if (!date) {
      setProblem("Choose a day.");
      return;
    }
    const [hours, minutes] = time.split(":").map(Number);
    const at = new Date(date);
    at.setHours(hours ?? 9, minutes ?? 0, 0, 0);
    if (at.getTime() <= Date.now()) {
      setProblem("Choose a time in the future, or publish now.");
      return;
    }
    setProblem(null);
    setOpen(false);
    onSchedule(at.toISOString());
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button size="sm" variant="outline" disabled={disabled} />}>
        Schedule…
      </PopoverTrigger>
      <PopoverContent className="w-auto" align="start">
        <PopoverHeader>
          <PopoverTitle>Schedule {label}</PopoverTitle>
          <PopoverDescription>
            Your local time. It is checked again before it goes out.
          </PopoverDescription>
        </PopoverHeader>
        <Calendar mode="single" selected={date} onSelect={setDate} disabled={{ before: today }} />
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-time`} className="text-body-sm font-medium">
              Time
            </label>
            <Input
              id={`${id}-time`}
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
          <Button size="sm" onClick={confirm}>
            Schedule
          </Button>
        </div>
        {problem ? (
          <p role="alert" className="text-body-sm text-destructive">
            {problem}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
