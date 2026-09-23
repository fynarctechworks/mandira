"use client";

import { Badge } from "@mandhira/ui/components/ui/badge";
import { Button } from "@mandhira/ui/components/ui/button";
import { Textarea } from "@mandhira/ui/components/ui/textarea";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState, type FormEvent, type ReactNode } from "react";

import {
  previewHref,
  strictestMobility,
  structuredFormHref,
  toLocalDateTime,
  type Mobility,
  type Pace,
} from "../lib/brief-to-preview";
import type { IntentExperience, IntentResult } from "../lib/intent";
import { VoiceInput } from "./voice-input";

type Destination = { id: string; slug: string; name: string };
type Extracted = Extract<IntentResult, { status: "extracted" }>;
type Decision = "keep" | "remove";

const FIELD = "min-h-11 w-full rounded-lg border border-border bg-bg-surface px-3 text-body";
const ROW = "flex flex-col gap-2 rounded-lg border border-border bg-bg-surface px-3 py-2";
const QUIET_LINK =
  "flex min-h-11 items-center justify-center text-body-sm text-text-secondary underline";

const MOBILITY_LABEL = {
  full: "mobility_full",
  limited_walking: "mobility_limited_walking",
  wheelchair: "mobility_wheelchair",
  needs_rest_frequently: "mobility_needs_rest_frequently",
} as const satisfies Record<Mobility, string>;

const PACE_LABEL = {
  relaxed: "pace_relaxed",
  balanced: "pace_balanced",
  full: "pace_full",
} as const satisfies Record<Pace, string>;

const DAY_CHOICES = [1, 2, 3, 4, 5, 6, 7];

/**
 * A07 → A08: describe the journey, then check what Mandhira understood (PRD F3).
 *
 * Nothing is planned until the traveler says so. Every value the model inferred rather than
 * read is marked Suggested and needs its own Keep or Take out before the plan can be built
 * (PRD-INT-003) — a guess that slips through unconfirmed is Mandhira deciding for them.
 * Requests nothing published matches are named, not dropped (PRD-INT-005), and questions the
 * model could not settle are shown rather than answered on the traveler's behalf (PRD-INT-004).
 *
 * When descriptions cannot be read — no model configured, the provider down, nothing published
 * to choose from — the screen hands over to the structured questions instead (TRD §5.5). That is
 * a route to the same plan, never an error.
 */
export function DescribeJourney({
  locale,
  destinations,
  available,
}: {
  locale: string;
  destinations: Destination[];
  available: boolean;
}) {
  const t = useTranslations("intent");
  const inputId = useId();
  const hintId = useId();
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"write" | "reading" | "unavailable">(
    available ? "write" : "unavailable",
  );
  const [result, setResult] = useState<Extracted | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function read(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length < 3) {
      setProblem(t("too_short"));
      return;
    }

    setProblem(null);
    setPhase("reading");

    const response = await fetch("/api/intent/extract", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: trimmed, locale }),
    }).catch(() => null);
    const payload = response ? await response.json().catch(() => null) : null;

    if (!payload?.ok) {
      setPhase("write");
      setProblem(payload?.error?.message ?? t("problem"));
      return;
    }

    const answer = payload.data as IntentResult;
    if (answer.status === "unavailable") {
      setPhase("unavailable");
      return;
    }

    setPhase("write");
    setResult(answer);
  }

  if (result) {
    return (
      <BriefReview
        locale={locale}
        destinations={destinations}
        result={result}
        onEdit={() => setResult(null)}
      />
    );
  }

  if (phase === "unavailable") {
    return (
      <section
        role="status"
        className="flex flex-col gap-3 rounded-lg border border-border bg-bg-surface p-4"
      >
        <h2 className="text-h3">{t("unavailable_title")}</h2>
        <p className="text-body-sm text-text-secondary">{t("unavailable_body")}</p>
        <Link
          href={structuredFormHref(locale)}
          className="focus-ring flex min-h-11 items-center justify-center rounded-lg bg-brand-primary px-4 text-body font-medium text-text-on-primary"
        >
          {t("use_form")}
        </Link>
      </section>
    );
  }

  return (
    <form onSubmit={(event) => void read(event)} className="flex flex-col gap-3">
      <label htmlFor={inputId} className="text-caption font-medium text-text-secondary">
        {t("input_label")}
      </label>
      <Textarea
        id={inputId}
        rows={6}
        maxLength={1000}
        value={text}
        onChange={(event) => setText(event.target.value)}
        aria-describedby={hintId}
      />
      <p id={hintId} className="text-caption text-text-secondary">
        {t("input_hint")}
      </p>

      {/*
        PRD §5 A07's mic. What is heard is ADDED to the box above, where it can be read and
        corrected before anything is sent — speaking is another way of typing, not a way
        around reviewing what Mandhira understood.
      */}
      <VoiceInput
        locale={locale}
        onText={(heard) =>
          setText((current) =>
            (current.trim() ? `${current.trimEnd()} ${heard}` : heard).slice(0, 1000),
          )
        }
      />

      {problem ? (
        <p role="alert" className="text-body-sm text-status-broken">
          {problem}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={phase === "reading"}>
        {phase === "reading" ? t("reading") : t("submit")}
      </Button>
      <Link href={structuredFormHref(locale)} className={QUIET_LINK}>
        {t("or_form")}
      </Link>
    </form>
  );
}

function BriefReview({
  locale,
  destinations,
  result,
  onEdit,
}: {
  locale: string;
  destinations: Destination[];
  result: Extracted;
  onEdit: () => void;
}) {
  const t = useTranslations("intent");
  const router = useRouter();
  const { brief } = result;
  const suggested = new Set(result.suggested);

  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [destinationId, setDestinationId] = useState(result.destination?.id ?? "");
  const [startDate, setStartDate] = useState(brief.startDate?.value ?? "");
  const [dayCount, setDayCount] = useState(clampDays(brief.dayCount?.value));
  const [pace, setPace] = useState<Pace | "">(brief.pace?.value ?? "");
  const [mobilityChoice, setMobilityChoice] = useState<Mobility | null>(null);
  const [returnIndex, setReturnIndex] = useState<number | null>(null);
  // Closest matches the traveler tapped for something Mandhira did not know (PRD-INT-005).
  const [addedLikes, setAddedLikes] = useState<IntentExperience[]>([]);

  const decide = (key: string, decision: Decision) =>
    setDecisions((current) => ({ ...current, [key]: decision }));
  const kept = (key: string) => decisions[key] !== "remove";

  // The resolved destination may sit outside the first page of cards; it is still a choice.
  const resolved = result.destination;
  const options =
    resolved && !destinations.some((d) => d.id === resolved.id)
      ? [resolved, ...destinations]
      : destinations;
  const destination = options.find((d) => d.id === destinationId);

  /*
   * Only picks at the chosen destination are offered. Choosing another destination does not
   * carry experiences across — an id from Srisailam in a Tirumala plan is nothing the engine
   * can place.
   */
  const names = new Map(
    [...result.experiences, ...result.unmatchedMatches.flatMap((match) => match.closest)].map(
      (experience) => [experience.id, experience],
    ),
  );
  const picksFor = (
    picks: { experienceId: string }[],
    prefix: "mustDo" | "wouldLike",
  ): { id: string; name: string; key: string }[] =>
    picks.flatMap((pick) => {
      const named = names.get(pick.experienceId);
      return named && named.destinationId === destinationId
        ? [{ id: named.id, name: named.name, key: `${prefix}.${named.id}` }]
        : [];
    });
  const mustPicks = picksFor(brief.mustDo, "mustDo");
  const likePicks = picksFor(
    [...brief.wouldLike, ...addedLikes.map((experience) => ({ experienceId: experience.id }))],
    "wouldLike",
  );

  const travelers = brief.travelers.map((traveler, index) => ({
    ...traveler,
    key: `travelers.${index}`,
  }));
  const mobility =
    mobilityChoice ?? strictestMobility(travelers.filter((traveler) => kept(traveler.key)));

  // A commitment with no readable time cannot anchor the return guard, so it is not offered as one.
  const commitments = brief.fixedCommitments.flatMap((commitment, index) => {
    const local = toLocalDateTime(commitment.at);
    return local
      ? [{ label: commitment.label, local, key: `fixedCommitments.${index}`, index }]
      : [];
  });

  const shown = new Set([
    "destination",
    "startDate",
    "dayCount",
    "pace",
    ...travelers.map((traveler) => traveler.key),
    ...mustPicks.map((pick) => pick.key),
    ...likePicks.map((pick) => pick.key),
    ...commitments.map((commitment) => commitment.key),
  ]);
  const pending = result.suggested.filter((key) => shown.has(key) && !decisions[key]).length;
  const hasBasics = !!destination && /^\d{4}-\d{2}-\d{2}$/.test(startDate);
  const ready = hasBasics && pending === 0;

  const keptIds = (picks: { id: string; key: string }[]) =>
    picks.filter((pick) => kept(pick.key)).map((pick) => pick.id);
  const chosenReturn = commitments.find(
    (commitment) => commitment.index === returnIndex && kept(commitment.key),
  );

  function build() {
    if (!ready || !destination) return;
    router.push(
      previewHref(locale, {
        destinationSlug: destination.slug,
        startDate,
        dayCount,
        ...(pace ? { pace } : {}),
        mobility,
        mustDo: keptIds(mustPicks),
        wouldLike: keptIds(likePicks),
        returnAt: chosenReturn?.local ?? null,
      }),
    );
  }

  const formHref = structuredFormHref(locale, {
    ...(destination ? { destinationSlug: destination.slug } : {}),
    dayCount,
    ...(pace ? { pace } : {}),
    mobility,
    mustDo: keptIds(mustPicks),
    wouldLike: keptIds(likePicks),
  });

  const choice = (key: string, label: string, onRemove?: () => void) =>
    suggested.has(key) ? (
      <SuggestionChoice
        label={label}
        decision={decisions[key]}
        onDecide={(decision) => {
          decide(key, decision);
          if (decision === "remove") onRemove?.();
        }}
      />
    ) : null;

  const pickSection = (id: string, title: string, picks: typeof mustPicks) => (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h3 id={id} className="text-h3">
        {title}
      </h3>
      {picks.length === 0 ? (
        <p className="text-body-sm text-text-secondary">{t("none_named")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {picks.map((pick) => (
            <li key={pick.key} className={ROW}>
              <Named kept={kept(pick.key)}>{pick.name}</Named>
              {choice(pick.key, pick.name)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h2 className="text-h2">{t("review_title")}</h2>
        <p className="text-body-sm text-text-secondary">{t("review_lede")}</p>
      </header>

      <section className="flex flex-col gap-4">
        <Field
          label={t("destination")}
          htmlFor="brief-destination"
          after={choice("destination", t("destination"), () => setDestinationId(""))}
        >
          <select
            id="brief-destination"
            value={destinationId}
            onChange={(event) => {
              setDestinationId(event.target.value);
              decide("destination", "keep");
            }}
            className={FIELD}
          >
            <option value="">{t("choose_destination")}</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label={t("start")}
          htmlFor="brief-start"
          after={choice("startDate", t("start"), () => setStartDate(""))}
        >
          <input
            id="brief-start"
            type="date"
            required
            value={startDate}
            onChange={(event) => {
              setStartDate(event.target.value);
              decide("startDate", "keep");
            }}
            className={FIELD}
          />
        </Field>

        <Field
          label={t("days")}
          htmlFor="brief-days"
          after={choice("dayCount", t("days"), () => setDayCount(3))}
        >
          <select
            id="brief-days"
            value={dayCount}
            onChange={(event) => {
              setDayCount(clampDays(Number(event.target.value)));
              decide("dayCount", "keep");
            }}
            className={FIELD}
          >
            {DAY_CHOICES.map((n) => (
              <option key={n} value={n}>
                {t("day_count", { count: n })}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label={t("pace")}
          htmlFor="brief-pace"
          after={choice("pace", t("pace"), () => setPace(""))}
        >
          <select
            id="brief-pace"
            value={pace}
            onChange={(event) => {
              setPace(asPace(event.target.value));
              decide("pace", "keep");
            }}
            className={FIELD}
          >
            <option value="">{t("pace_unset")}</option>
            {(Object.keys(PACE_LABEL) as Pace[]).map((option) => (
              <option key={option} value={option}>
                {t(PACE_LABEL[option])}
              </option>
            ))}
          </select>
        </Field>
      </section>

      <section aria-labelledby="brief-travelers" className="flex flex-col gap-3">
        <h3 id="brief-travelers" className="text-h3">
          {t("travelers")}
        </h3>
        {travelers.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {travelers.map((traveler) => (
              <li key={traveler.key} className={ROW}>
                <Named kept={kept(traveler.key)}>
                  {traveler.label}
                  {traveler.mobility && traveler.mobility !== "full"
                    ? ` · ${t(MOBILITY_LABEL[traveler.mobility])}`
                    : ""}
                </Named>
                {choice(traveler.key, traveler.label)}
              </li>
            ))}
          </ul>
        ) : null}
        {/*
         * Asked, never assumed: the strictest need among the travelers who were kept is only the
         * starting value, and it stays on this device — nothing here writes traveler_profiles.
         */}
        <Field label={t("mobility")} htmlFor="brief-mobility" hint={t("mobility_hint")}>
          <select
            id="brief-mobility"
            value={mobility}
            onChange={(event) => setMobilityChoice(asMobility(event.target.value))}
            className={FIELD}
          >
            {(Object.keys(MOBILITY_LABEL) as Mobility[]).map((option) => (
              <option key={option} value={option}>
                {t(MOBILITY_LABEL[option])}
              </option>
            ))}
          </select>
        </Field>
      </section>

      {pickSection("brief-must", t("must"), mustPicks)}
      {pickSection("brief-like", t("like"), likePicks)}

      {commitments.length > 0 ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="text-h3">{t("return")}</legend>
          <p className="text-body-sm text-text-secondary">{t("return_hint")}</p>
          {commitments.map((commitment) => (
            <div key={commitment.key} className={ROW}>
              <label className="flex min-h-11 items-center gap-3">
                <input
                  type="radio"
                  name="brief-return"
                  checked={returnIndex === commitment.index}
                  disabled={!kept(commitment.key)}
                  onChange={() => setReturnIndex(commitment.index)}
                  className="size-5 shrink-0"
                />
                <Named kept={kept(commitment.key)}>
                  {commitment.label} — {commitment.local.replace("T", " ")}
                </Named>
              </label>
              {choice(commitment.key, commitment.label, () => {
                if (returnIndex === commitment.index) setReturnIndex(null);
              })}
            </div>
          ))}
          <label className="flex min-h-11 items-center gap-3 px-3">
            <input
              type="radio"
              name="brief-return"
              checked={returnIndex === null}
              onChange={() => setReturnIndex(null)}
              className="size-5 shrink-0"
            />
            <span className="text-body">{t("return_none")}</span>
          </label>
        </fieldset>
      ) : null}

      {result.unmatched.length > 0 ? (
        <section
          aria-labelledby="brief-unmatched"
          className="flex flex-col gap-2 rounded-lg border border-border bg-bg-surface p-3"
        >
          <h3 id="brief-unmatched" className="text-h3">
            {t("unmatched_title")}
          </h3>
          <p className="text-body-sm text-text-secondary">{t("unmatched_body")}</p>
          <ul className="flex flex-col gap-3">
            {result.unmatchedMatches.map((match, index) => {
              // Only matches at the chosen destination can go into this plan.
              const here = match.closest.filter(
                (experience) => experience.destinationId === destinationId,
              );
              return (
                <li key={`${match.text}-${index}`} className="flex flex-col gap-2 text-body-sm">
                  <p>{t("no_verified", { name: match.text })}</p>
                  {here.length === 0 ? (
                    <p className="text-text-secondary">{t("no_closest")}</p>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <p className="text-caption font-medium text-text-secondary">
                        {t("closest_title")}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {here.map((experience) => {
                          const added = addedLikes.some((like) => like.id === experience.id);
                          return (
                            <Button
                              key={experience.id}
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={added}
                              onClick={() =>
                                setAddedLikes((current) =>
                                  current.some((like) => like.id === experience.id)
                                    ? current
                                    : [...current, experience],
                                )
                              }
                            >
                              {added
                                ? `${experience.name} — ${t("added_closest")}`
                                : t("add_closest", { name: experience.name })}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {result.unclear.length > 0 ? (
        <section
          aria-labelledby="brief-unclear"
          className="flex flex-col gap-2 rounded-lg border border-border bg-bg-surface p-3"
        >
          <h3 id="brief-unclear" className="text-h3">
            {t("unclear_title")}
          </h3>
          <p className="text-body-sm text-text-secondary">{t("unclear_body")}</p>
          <ul className="list-disc pl-5 text-body-sm">
            {result.unclear.map((item, index) => (
              <li key={`${item.question}-${index}`}>{item.question}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-col gap-2">
        <p aria-live="polite" className="text-body-sm text-text-secondary">
          {pending > 0 ? t("pending", { count: pending }) : hasBasics ? null : t("needs_basics")}
        </p>
        <Button type="button" className="w-full" onClick={build} disabled={!ready}>
          {t("build")}
        </Button>
        <Link href={formHref} className={QUIET_LINK}>
          {t("adjust_in_form")}
        </Link>
        <Button type="button" variant="ghost" className="w-full" onClick={onEdit}>
          {t("edit_description")}
        </Button>
      </div>
    </div>
  );
}

/** The Suggested label and its two explicit choices (PRD-INT-003). Neither is pre-selected. */
function SuggestionChoice({
  label,
  decision,
  onDecide,
}: {
  label: string;
  decision: Decision | undefined;
  onDecide: (decision: Decision) => void;
}) {
  const t = useTranslations("intent");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline">{t("suggested")}</Badge>
      <div role="group" aria-label={`${t("suggested")}: ${label}`} className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={decision === "keep" ? "default" : "outline"}
          aria-pressed={decision === "keep"}
          onClick={() => onDecide("keep")}
        >
          {t("keep")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={decision === "remove" ? "default" : "outline"}
          aria-pressed={decision === "remove"}
          onClick={() => onDecide("remove")}
        >
          {t("remove")}
        </Button>
      </div>
    </div>
  );
}

function Named({ kept, children }: { kept: boolean; children: ReactNode }) {
  return (
    <span className={kept ? "text-body" : "text-body text-text-secondary line-through"}>
      {children}
    </span>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  after,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  after?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-caption font-medium text-text-secondary">
        {label}
      </label>
      {children}
      {hint ? <p className="text-caption text-text-secondary">{hint}</p> : null}
      {after}
    </div>
  );
}

function clampDays(value: number | undefined): number {
  return value && Number.isFinite(value) ? Math.min(7, Math.max(1, Math.round(value))) : 3;
}

function asPace(value: string): Pace | "" {
  return value === "relaxed" || value === "balanced" || value === "full" ? value : "";
}

function asMobility(value: string): Mobility {
  return (Object.keys(MOBILITY_LABEL) as Mobility[]).find((option) => option === value) ?? "full";
}
