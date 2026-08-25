"use client";

import { Button } from "@mandhira/ui";
import type { OpeningSchedule } from "@mandhira/db";
import { useId } from "react";

const DAYS = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
] as const;

type Day = (typeof DAYS)[number]["key"];
type Range = [string, string];

/**
 * Builder for `places.opening_schedule` (TRD §11.2 Day 5).
 *
 * This is a CRITICAL field: the engine schedules against it, so a wrong schedule produces
 * a wrong plan rather than a cosmetic glitch. The shape is validated by
 * `openingScheduleSchema` on save (B-005); this UI exists so an operator never has to
 * hand-write the jsonb.
 *
 * Two deliberate choices:
 *  - A day with NO ranges means closed that day. That is different from a day that is
 *    absent, which means "not recorded" — the distinction matters to the engine, so the
 *    UI makes it explicit rather than inferring.
 *  - Split hours (morning and evening darshan) are the normal case for temples, not an
 *    edge case, so adding a second range is a single tap.
 */
export function OpeningScheduleBuilder({
  value,
  onChange,
}: {
  value: OpeningSchedule;
  onChange: (next: OpeningSchedule) => void;
}) {
  const groupId = useId();
  const weekly = value.weekly ?? {};

  const setDay = (day: Day, ranges: Range[] | undefined) => {
    const nextWeekly: Record<string, Range[]> = { ...(weekly as Record<string, Range[]>) };
    if (ranges === undefined) delete nextWeekly[day];
    else nextWeekly[day] = ranges;
    onChange({ ...value, weekly: nextWeekly });
  };

  const setRange = (day: Day, index: number, part: 0 | 1, time: string) => {
    const ranges = [...(((weekly as Record<string, Range[]>)[day] ?? []) as Range[])];
    const current: Range = ranges[index] ?? ["", ""];
    const updated: Range = part === 0 ? [time, current[1]] : [current[0], time];
    ranges[index] = updated;
    setDay(day, ranges);
  };

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-body-sm font-medium">Opening hours</legend>
      {/* text-secondary, not tertiary: this sits on the tinted "critical information"
          panel, where caption-sized tertiary text falls under AA — and it is guidance an
          operator needs to read, not de-emphasised chrome. */}
      <p id={`${groupId}-help`} className="text-caption text-text-secondary">
        Leave a day untouched if the hours aren&apos;t known. Mark it closed to record that it
        genuinely has no opening hours — the engine treats those differently.
      </p>

      <ul className="flex flex-col gap-2">
        {DAYS.map(({ key, label }) => {
          const ranges = ((weekly as Record<string, Range[]>)[key] ?? null) as Range[] | null;
          const recorded = ranges !== null;
          const closed = recorded && ranges.length === 0;

          return (
            <li
              key={key}
              className="flex flex-wrap items-center gap-2 rounded-card border border-border-subtle bg-surface px-3 py-2"
            >
              <span className="w-24 shrink-0 text-body-sm font-medium">{label}</span>

              {!recorded ? (
                <>
                  <span className="flex-1 text-body-sm text-text-tertiary">Not recorded</span>
                  <Button
                    type="button"
                    variant="tertiary"
                    onClick={() => setDay(key, [["06:00", "12:00"]])}
                  >
                    Add hours
                  </Button>
                  <Button type="button" variant="tertiary" onClick={() => setDay(key, [])}>
                    Mark closed
                  </Button>
                </>
              ) : closed ? (
                <>
                  <span className="flex-1 text-body-sm">Closed all day</span>
                  <Button type="button" variant="tertiary" onClick={() => setDay(key, undefined)}>
                    Clear
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex flex-1 flex-wrap gap-2">
                    {ranges.map((range, index) => (
                      <span key={index} className="flex items-center gap-1">
                        <input
                          type="time"
                          value={range[0]}
                          aria-label={`${label} opening time ${index + 1}`}
                          onChange={(e) => setRange(key, index, 0, e.target.value)}
                          className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-2 text-body-sm"
                        />
                        <span aria-hidden="true">–</span>
                        <input
                          type="time"
                          value={range[1]}
                          aria-label={`${label} closing time ${index + 1}`}
                          onChange={(e) => setRange(key, index, 1, e.target.value)}
                          className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-2 text-body-sm"
                        />
                        <button
                          type="button"
                          aria-label={`Remove ${label} hours ${index + 1}`}
                          onClick={() =>
                            setDay(
                              key,
                              ranges.filter((_, i) => i !== index),
                            )
                          }
                          className="focus-ring min-h-11 px-2 text-body-sm text-brand-primary-text"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="tertiary"
                    onClick={() => setDay(key, [...ranges, ["16:00", "21:00"]])}
                  >
                    Add split
                  </Button>
                  <Button type="button" variant="tertiary" onClick={() => setDay(key, undefined)}>
                    Clear
                  </Button>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
