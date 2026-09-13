"use client";

import { ChecklistRow } from "@mandhira/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";

import type { PrepareGroupView, PrepareItem } from "../lib/prepare";
import { FieldTrust } from "./field-trust";

/**
 * The Prepare checklist (PRD F7, PRD-PREP-001).
 *
 * Ticks are optimistic: the box moves the instant it is tapped, and rolls back if the
 * write fails. A checkbox that waits for a round trip in a temple queue on 2G feels
 * broken, and the traveler taps it again — which is how a tick becomes an untick.
 *
 * Nothing here infers a tick. Whether a ticket was actually booked is something only the
 * traveler knows (PRD Principle 6).
 */
export function PrepareList({
  journeyId,
  groups,
  dateLabels,
}: {
  journeyId: string;
  groups: PrepareGroupView[];
  /** Formatted by the server, which is where the locale lives. */
  dateLabels: Record<string, string>;
}) {
  const t = useTranslations("prepareList");
  const tCommon = useTranslations("common");
  const [done, setDone] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.flatMap((g) => g.tasks.map((t) => [t.key, t.isDone]))),
  );
  const [problem, setProblem] = useState<string | null>(null);

  async function toggle(task: PrepareItem, next: boolean) {
    setDone((current) => ({ ...current, [task.key]: next }));
    setProblem(null);

    const response = await fetch(`/api/journeys/${journeyId}/prepare`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: task.key, isDone: next }),
    });

    const payload = await response.json().catch(() => ({ ok: false }));

    if (!payload.ok) {
      setDone((current) => ({ ...current, [task.key]: !next }));
      setProblem(t("not_saved"));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {problem ? (
        <p role="alert" className="text-body-sm text-status-broken">
          {problem}
        </p>
      ) : null}

      {groups.map((group) => (
        <section key={group.group} aria-labelledby={`prepare-${group.group}`}>
          <h2 id={`prepare-${group.group}`} className="mb-2 text-h2">
            {group.heading}
          </h2>

          <div className="rounded-lg border border-border bg-bg-surface px-4">
            {group.tasks.map((task) => (
              <ChecklistRow
                key={task.key}
                label={
                  task.dueDate
                    ? t("due", {
                        title: task.title,
                        date: dateLabels[task.dueDate] ?? task.dueDate,
                      })
                    : task.title
                }
                checked={done[task.key] ?? false}
                onCheckedChange={(value) => void toggle(task, value)}
                /*
                 * The "Why?" text is the knowledge itself — how to book, what the dress
                 * code is — lifted verbatim. Never a generated explanation.
                 */
                {...(task.body ? { why: task.body } : {})}
                {...(task.trust && task.trustFieldLabel
                  ? {
                      badge: (
                        <FieldTrust
                          entry={task.trust}
                          fieldLabel={task.trustFieldLabel}
                          lastConfirmed={
                            task.trust.verified_at
                              ? (dateLabels[task.trust.verified_at.slice(0, 10)] ??
                                task.trust.verified_at.slice(0, 10))
                              : tCommon("not_recorded")
                          }
                        />
                      ),
                    }
                  : {})}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
