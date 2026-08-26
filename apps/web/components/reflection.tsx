"use client";

import { Button } from "@mandhira/ui";
import { useState } from "react";

import { REFLECTION_QUESTIONS, type ReflectionAnswers } from "../lib/reflection";

/**
 * The reflection prompt (PRD F16, PRD-CMPL-002).
 *
 * Three open questions, all optional, all skippable, and private. There is no "submit" in
 * the sense of sending something to us for review — the answers go into a row only the
 * traveler can read, and the screen says so plainly, because a text box after a pilgrimage
 * looks like a review form unless you are told otherwise.
 *
 * The third question offers to turn the answer into a report (PRD F14). OFFERED. Someone
 * writing privately about what went wrong has not asked us to file anything, and turning
 * a reflection into a ticket without being asked is the fastest way to make people stop
 * writing honestly.
 */
export function Reflection({
  journeyId,
  initial,
  locale,
}: {
  journeyId: string;
  initial: ReflectionAnswers | null;
  locale: string;
}) {
  const [answers, setAnswers] = useState<ReflectionAnswers>(initial ?? {});
  const [state, setState] = useState<"idle" | "saving" | "saved" | "problem">("idle");

  async function save() {
    setState("saving");

    const response = await fetch(`/api/journeys/${journeyId}/reflection`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(answers),
    });

    const payload = await response.json().catch(() => ({ ok: false }));
    setState(payload.ok ? "saved" : "problem");
  }

  return (
    <section aria-labelledby="reflection" className="flex flex-col gap-3">
      <h2 id="reflection" className="text-h2">
        Looking back
      </h2>

      <p className="text-body-sm text-text-secondary">
        Only you can see these. They&apos;re not sent anywhere and nobody reviews them — skip
        any that don&apos;t apply.
      </p>

      {REFLECTION_QUESTIONS.map((item) => (
        <div key={item.key} className="flex flex-col gap-1">
          <label htmlFor={`reflect-${item.key}`} className="text-body-sm font-medium">
            {item.question}
          </label>
          <textarea
            id={`reflect-${item.key}`}
            rows={3}
            maxLength={2000}
            value={answers[item.key] ?? ""}
            onChange={(event) =>
              setAnswers((current) => ({ ...current, [item.key]: event.target.value }))
            }
            className="focus-ring rounded-lg border border-border bg-bg-surface p-3 text-body-sm"
          />

          {"offersReport" in item && item.offersReport && (answers[item.key] ?? "").trim() ? (
            /*
             * PRD F16's one bridge to F14, and it only appears once there is something to
             * bridge. A traveler who wrote nothing is not asked whether they would like to
             * report nothing.
             */
            <p className="text-caption text-text-secondary">
              If something we published was wrong, you can{" "}
              <a
                href={`/${locale}/journeys/${journeyId}`}
                className="font-medium text-brand-primary-text underline"
              >
                report it on the place itself
              </a>{" "}
              so someone can check it. Your note above stays private either way.
            </p>
          ) : null}
        </div>
      ))}

      <div className="flex items-center gap-3">
        <Button onClick={() => void save()} disabled={state === "saving"}>
          {state === "saving" ? "Saving…" : "Save"}
        </Button>

        {state === "saved" ? (
          <p role="status" className="text-body-sm text-text-secondary">
            Saved, just for you.
          </p>
        ) : null}
        {state === "problem" ? (
          <p role="alert" className="text-body-sm text-status-broken">
            That didn&apos;t save. Please try again.
          </p>
        ) : null}
      </div>
    </section>
  );
}
