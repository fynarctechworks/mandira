import { HealthPill } from "@mandhira/ui";
import type { Cause, HealthReport, TrustCause } from "@mandhira/journey-engine";

/**
 * Journey Health (PRD F5).
 *
 * The engine returns i18n KEYS and parameters, never sentences — it runs in a worker, on a
 * server and offline, none of which knows the traveler's language. This is where they
 * become English. When te/hi land in B-034 this map moves into the message files; keeping
 * it here now means the strings exist in exactly one place to move.
 *
 * PRD F5 forbids a numeric score. The state and its causes are the whole output: a number
 * would be something a traveler has to interpret, and they would interpret it differently
 * from us.
 */
const CAUSE_TEXT: Record<string, (p: Record<string, string | number>) => string> = {
  "health.cause.day_overruns": (p) => `This day runs about ${p["minutes"]} minutes past its end.`,
  "health.cause.outside_availability": (p) =>
    `Something is planned for ${p["at"]}, when it isn't running.`,
  "health.cause.dependency_broken": () => "Something is planned before the thing it depends on.",
  "health.cause.walking_over_limit": (p) =>
    `Walking is about ${p["metres"]} m — above the ${p["limitMetres"]} m that's comfortable for your group.`,
  "health.cause.not_step_free": () => "One of these places isn't step-free.",
  "health.cause.partly_step_free": () => "One of these places is only partly step-free.",
  "health.cause.step_free_unknown": () => "We don't know whether one of these places is step-free.",
  "health.cause.no_rest_in_stretch": (p) =>
    `There's about ${p["minutes"]} minutes here without a proper break.`,
  "health.cause.return_guard_breached": (p) =>
    `You'd reach your return about ${p["minutes"]} minutes late.`,
};

const TRUST_TEXT: Record<string, (count: number) => string> = {
  "health.trust.unverified": (n) =>
    n === 1
      ? "1 detail here hasn't been verified recently."
      : `${n} details here haven't been verified recently.`,
  "health.trust.conflicting": (n) =>
    n === 1
      ? "1 detail here has sources that disagree."
      : `${n} details here have sources that disagree.`,
};

export function causeText(cause: Cause): string {
  const render = CAUSE_TEXT[cause.key];
  // An unmapped key renders as nothing rather than as its key. A traveler seeing
  // "health.cause.x" learns only that something is broken in the app (D-056's reasoning).
  return render ? render(cause.params ?? {}) : "";
}

export function trustText(cause: TrustCause): string {
  const render = TRUST_TEXT[cause.key];
  return render ? render(cause.count) : "";
}

/** The journey-level state, which PRD F5 defines as its worst day. */
export function JourneyHealth({ report }: { report: HealthReport }) {
  return (
    <section aria-labelledby="health" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h2 id="health" className="text-h2">
          How this journey holds together
        </h2>
        <HealthPill state={report.journeyState} />
      </div>
      <p className="text-body-sm text-text-secondary">
        {/* PRD F5's own displayed strings. */}
        {
          {
            comfortable: "Comfortable — there's room to breathe.",
            tight: "Tight — workable, but delays will have an effect.",
            at_risk: "At risk — something may not fit. Let's look at options.",
            broken: "This can't work as planned. Here's what would need to change.",
          }[report.journeyState]
        }
      </p>
    </section>
  );
}
