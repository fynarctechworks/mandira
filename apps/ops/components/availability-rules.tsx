"use client";

import { Button } from "@mandhira/ui";
import { useState } from "react";
import { addAvailabilityRule, deleteAvailabilityRule } from "@/app/(ops)/experiences/actions";

export type AvailabilityRuleRow = {
  id: string;
  kind: string;
  daily_times: unknown;
  weekly_pattern: unknown;
  date_start: string | null;
  date_end: string | null;
  calendar_dates: string[] | null;
  priority: number;
};

const KINDS = [
  { value: "always_during_opening", label: "Whenever the place is open" },
  { value: "daily_fixed_times", label: "Fixed times each day" },
  { value: "weekly_pattern", label: "Different times per weekday" },
  { value: "date_range", label: "A date range" },
  { value: "calendar_dates", label: "Specific dates" },
  { value: "on_request", label: "On request only" },
] as const;

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

type Kind = (typeof KINDS)[number]["value"];
type Window = { start: string; end: string };

/**
 * Availability rules for an experience (OPS-EDIT-03).
 *
 * Every row here is a CRITICAL field: this is what the engine schedules against, so the
 * form only ever offers the fields the selected kind actually uses. Showing all payloads
 * at once would invite an operator to fill in a date range for a weekly pattern, and the
 * rule would then be rejected on save for reasons that look arbitrary.
 *
 * Rules stack by `priority` — a festival-week rule overrides the everyday one — so the
 * priority control is visible rather than hidden behind an "advanced" toggle.
 */
export function AvailabilityRules({
  experienceId,
  rules,
}: {
  experienceId: string;
  rules: AvailabilityRuleRow[];
}) {
  const [kind, setKind] = useState<Kind>("daily_fixed_times");
  const [priority, setPriority] = useState(1);
  const [dailyTimes, setDailyTimes] = useState<Window[]>([{ start: "06:00", end: "07:30" }]);
  const [weekly, setWeekly] = useState<Record<string, Window[]>>({});
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [calendarDates, setCalendarDates] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setProblem(null);

    const payload: Record<string, unknown> = { experience_id: experienceId, kind, priority };
    if (kind === "daily_fixed_times") payload["daily_times"] = dailyTimes;
    if (kind === "weekly_pattern") payload["weekly_pattern"] = weekly;
    if (kind === "date_range") {
      payload["date_start"] = dateStart || null;
      payload["date_end"] = dateEnd || null;
    }
    if (kind === "calendar_dates") {
      payload["calendar_dates"] = calendarDates
        .split(/[,\s]+/)
        .map((d) => d.trim())
        .filter(Boolean);
    }

    const result = await addAvailabilityRule(payload);
    setBusy(false);

    if (!result.ok) {
      const first = Object.values(result.error.fieldErrors ?? {})[0]?.[0];
      setProblem(first ?? result.error.message);
      return;
    }
    window.location.reload();
  }

  async function remove(id: string) {
    await deleteAvailabilityRule({ id, experience_id: experienceId });
    window.location.reload();
  }

  return (
    <section className="flex flex-col gap-4 rounded-card border border-border-subtle bg-surface p-4">
      <div>
        <h2 className="text-h3">When it happens</h2>
        <p className="mt-1 text-body-sm text-text-secondary">
          The engine plans against these. Rules with a higher priority win where they overlap.
        </p>
      </div>

      {rules.length === 0 ? (
        <p className="text-body-sm text-text-tertiary">
          No availability recorded yet — the engine can&apos;t schedule this experience until there
          is at least one rule.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="flex items-center justify-between gap-3 rounded-button border border-border-subtle px-3 py-2"
            >
              <span className="text-body-sm">
                <span className="font-medium">
                  {KINDS.find((k) => k.value === rule.kind)?.label ?? rule.kind}
                </span>
                <span className="block text-caption text-text-tertiary">
                  {describeRule(rule)} · priority {rule.priority}
                </span>
              </span>
              <Button type="button" variant="tertiary" onClick={() => void remove(rule.id)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-3 border-t border-border-subtle pt-4">
        <label className="flex flex-col gap-1 text-body-sm font-medium">
          Add a rule
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
            className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>

        {kind === "daily_fixed_times" ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-body-sm">Times</legend>
            {dailyTimes.map((window, index) => (
              <span key={index} className="flex items-center gap-2">
                <input
                  type="time"
                  aria-label={`Start time ${index + 1}`}
                  value={window.start}
                  onChange={(e) =>
                    setDailyTimes((w) =>
                      w.map((x, i) => (i === index ? { ...x, start: e.target.value } : x)),
                    )
                  }
                  className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-2 text-body-sm"
                />
                <span aria-hidden="true">–</span>
                <input
                  type="time"
                  aria-label={`End time ${index + 1}`}
                  value={window.end}
                  onChange={(e) =>
                    setDailyTimes((w) =>
                      w.map((x, i) => (i === index ? { ...x, end: e.target.value } : x)),
                    )
                  }
                  className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-2 text-body-sm"
                />
                {dailyTimes.length > 1 ? (
                  <button
                    type="button"
                    aria-label={`Remove time ${index + 1}`}
                    onClick={() => setDailyTimes((w) => w.filter((_, i) => i !== index))}
                    className="focus-ring min-h-11 px-2 text-brand-primary-text"
                  >
                    ×
                  </button>
                ) : null}
              </span>
            ))}
            <Button
              type="button"
              variant="tertiary"
              onClick={() => setDailyTimes((w) => [...w, { start: "18:30", end: "19:30" }])}
            >
              Add another time
            </Button>
          </fieldset>
        ) : null}

        {kind === "weekly_pattern" ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-body-sm">Per weekday</legend>
            {WEEKDAYS.map((day) => {
              const windows = weekly[day] ?? [];
              return (
                <span key={day} className="flex items-center gap-2">
                  <span className="w-12 text-body-sm capitalize">{day}</span>
                  {windows.length === 0 ? (
                    <Button
                      type="button"
                      variant="tertiary"
                      onClick={() =>
                        setWeekly((w) => ({ ...w, [day]: [{ start: "06:00", end: "07:30" }] }))
                      }
                    >
                      Add
                    </Button>
                  ) : (
                    <>
                      <input
                        type="time"
                        aria-label={`${day} start`}
                        value={windows[0]!.start}
                        onChange={(e) =>
                          setWeekly((w) => ({
                            ...w,
                            [day]: [{ ...windows[0]!, start: e.target.value }],
                          }))
                        }
                        className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-2 text-body-sm"
                      />
                      <span aria-hidden="true">–</span>
                      <input
                        type="time"
                        aria-label={`${day} end`}
                        value={windows[0]!.end}
                        onChange={(e) =>
                          setWeekly((w) => ({
                            ...w,
                            [day]: [{ ...windows[0]!, end: e.target.value }],
                          }))
                        }
                        className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-2 text-body-sm"
                      />
                      <button
                        type="button"
                        aria-label={`Clear ${day}`}
                        onClick={() =>
                          setWeekly((w) => {
                            const next = { ...w };
                            delete next[day];
                            return next;
                          })
                        }
                        className="focus-ring min-h-11 px-2 text-brand-primary-text"
                      >
                        ×
                      </button>
                    </>
                  )}
                </span>
              );
            })}
          </fieldset>
        ) : null}

        {kind === "date_range" ? (
          <div className="flex flex-wrap gap-3">
            <label className="flex min-w-48 flex-1 flex-col gap-1 text-body-sm">
              From
              <input
                type="date"
                value={dateStart}
                onChange={(e) => setDateStart(e.target.value)}
                className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body"
              />
            </label>
            <label className="flex min-w-48 flex-1 flex-col gap-1 text-body-sm">
              To
              <input
                type="date"
                value={dateEnd}
                onChange={(e) => setDateEnd(e.target.value)}
                className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body"
              />
            </label>
          </div>
        ) : null}

        {kind === "calendar_dates" ? (
          <label className="flex flex-col gap-1 text-body-sm">
            Dates
            <input
              type="text"
              value={calendarDates}
              placeholder="2026-10-12, 2026-10-13"
              onChange={(e) => setCalendarDates(e.target.value)}
              className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body"
            />
            <span className="text-caption text-text-tertiary">Comma-separated, as YYYY-MM-DD.</span>
          </label>
        ) : null}

        <label className="flex w-full flex-col sm:w-40 gap-1 text-body-sm">
          Priority
          <input
            type="number"
            min={1}
            max={99}
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body"
          />
        </label>

        {problem ? (
          <p role="alert" className="text-body-sm text-status-tight">
            {problem}
          </p>
        ) : null}

        <div>
          <Button type="button" loading={busy} onClick={() => void add()}>
            Add rule
          </Button>
        </div>
      </div>
    </section>
  );
}

/** One-line summary of a saved rule, so the list is readable without opening anything. */
function describeRule(rule: AvailabilityRuleRow): string {
  switch (rule.kind) {
    case "daily_fixed_times": {
      const times = (rule.daily_times as { start: string; end: string }[] | null) ?? [];
      return times.map((t) => `${t.start}–${t.end}`).join(", ") || "no times set";
    }
    case "weekly_pattern": {
      const pattern = (rule.weekly_pattern as Record<string, unknown> | null) ?? {};
      return Object.keys(pattern).join(", ") || "no days set";
    }
    case "date_range":
      return `${rule.date_start ?? "?"} → ${rule.date_end ?? "?"}`;
    case "calendar_dates":
      return (rule.calendar_dates ?? []).join(", ") || "no dates set";
    case "on_request":
      return "arranged in advance";
    default:
      return "follows the place's opening hours";
  }
}
