import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getDestinationCards, getDestinationPage } from "../../../lib/knowledge";

/**
 * The structured brief (PRD F3's second path, PRD-INT-002).
 *
 * PRD F3 offers two ways in: describe the journey in your own words, or answer a few
 * questions. This is the second. It needs no AI, which is why it can exist before B-018 —
 * and it is also the fallback TRD §5.5 requires when the AI provider is unavailable, so
 * it has to work on its own terms rather than as a degraded mode.
 *
 * Everything is skippable except destination and dates (PRD-INT-002). Nothing here is
 * inferred and labelled "Suggested" — inference is the AI path's job, and a form that
 * guesses on the traveler's behalf would be doing the one thing PRD Principle 1 reserves
 * for them.
 */
export const dynamic = "force-dynamic";

/**
 * What the form will accept as defaults.
 *
 * Deliberately no `start`: this form exists to be answered, and pre-filling a date the
 * traveler did not choose is the inference PRD Principle 1 reserves for them.
 */
type PrefillParams = {
  destination?: string;
  days?: string;
  pace?: string;
  mobility?: string;
  must?: string | string[];
  like?: string | string[];
};

/** A repeated query param arrives as a string or an array, depending on how many. */
function asArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export default async function PlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<PrefillParams>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, tPlan, tHub, tDiscovery] = await Promise.all([
    getTranslations("intent"),
    getTranslations("planForm"),
    getTranslations("prepareHub"),
    getTranslations("discovery"),
  ]);
  const query = await searchParams;
  const destinationSlug = query.destination;
  const destinations = await getDestinationCards(locale, 20);

  /*
   * Everything except the dates can arrive pre-filled. That is what "plan a similar
   * journey" hands over (PRD-CMPL-003): the same destination, the same length, the same
   * pace, the same mobility, and the same tiers — WHEN is left blank on purpose, because
   * it is the one thing the traveler certainly has a view on and the one thing a previous
   * journey cannot tell us.
   */
  const mustDo = new Set(asArray(query.must));
  const wouldLike = new Set(asArray(query.like));

  if (destinations.length === 0) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-6">
        <h1 className="text-display">{tHub("plan")}</h1>
        <p className="text-body text-text-secondary">{tPlan("no_destinations")}</p>
      </main>
    );
  }

  const chosen = destinationSlug ?? destinations[0]!.slug;
  const page = await getDestinationPage(chosen, locale);
  if (!page) notFound();

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-display">{tHub("plan")}</h1>
        <p className="text-body text-text-secondary">{tPlan("intro")}</p>
        {/* PRD F3's first path, for anyone who would rather just say it (A07). */}
        <Link
          href={`/${locale}/plan/describe`}
          className="flex min-h-11 items-center text-body-sm font-medium text-primary-text underline"
        >
          {t("entry_link")}
        </Link>
      </header>

      {/*
       * A GET form, like search (D-089). The brief ends up in the URL, so a half-finished
       * plan survives a reload and can be sent to whoever is coming along.
       */}
      <form method="get" action={`/${locale}/plan/preview`} className="flex flex-col gap-6">
        <Fieldset legend={tPlan("where_when")} hint={tPlan("where_when_hint")}>
          <Field label={t("destination")} htmlFor="destination">
            <select
              id="destination"
              name="destination"
              defaultValue={chosen}
              className="min-h-11 w-full rounded-lg border border-border bg-bg-surface px-3 text-body"
            >
              {destinations.map((d) => (
                <option key={d.id} value={d.slug}>
                  {d.name.text}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t("start")} htmlFor="start">
            <input
              id="start"
              name="start"
              type="date"
              required
              className="min-h-11 w-full rounded-lg border border-border bg-bg-surface px-3 text-body"
            />
          </Field>

          <Field label={t("days")} htmlFor="days">
            <select
              id="days"
              name="days"
              defaultValue={query.days ?? "3"}
              className="min-h-11 w-full rounded-lg border border-border bg-bg-surface px-3 text-body"
            >
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>
                  {t("day_count", { count: n })}
                </option>
              ))}
            </select>
          </Field>
        </Fieldset>

        <Fieldset legend={t("must")} hint={tPlan("must_hint")}>
          {page.experiences.length === 0 ? (
            <p className="text-body-sm text-text-secondary">{tDiscovery("empty")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {page.experiences.map((experience) => (
                <li key={experience.id}>
                  <label className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-bg-surface px-3 py-2">
                    <input
                      type="checkbox"
                      name="must"
                      value={experience.id}
                      defaultChecked={mustDo.has(experience.id)}
                      className="size-5 shrink-0"
                    />
                    <span className="text-body">{experience.name.text}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </Fieldset>

        <Fieldset legend={t("like")} hint={tPlan("like_hint")}>
          <ul className="flex flex-col gap-2">
            {page.experiences.map((experience) => (
              <li key={experience.id}>
                <label className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-bg-surface px-3 py-2">
                  <input
                    type="checkbox"
                    name="like"
                    value={experience.id}
                    defaultChecked={wouldLike.has(experience.id)}
                    className="size-5 shrink-0"
                  />
                  <span className="text-body">{experience.name.text}</span>
                </label>
              </li>
            ))}
          </ul>
        </Fieldset>

        <Fieldset legend={tPlan("getting_home")} hint={tPlan("getting_home_hint")}>
          {/*
           * The return guard's anchor (PRD-PLAN-006). Optional like everything else, but
           * it is the single most useful thing a traveler can tell Mandhira: a day that
           * overruns is inconvenient, a day that misses the train home is not.
           */}
          <Field label={tPlan("return_label")} htmlFor="return">
            <input
              id="return"
              name="return"
              type="datetime-local"
              className="min-h-11 w-full rounded-lg border border-border bg-bg-surface px-3 text-body"
            />
          </Field>
        </Fieldset>

        <Fieldset legend={tPlan("how_you_travel")} hint={tPlan("how_you_travel_hint")}>
          <Field label={t("pace")} htmlFor="pace">
            <select
              id="pace"
              name="pace"
              defaultValue={query.pace ?? "balanced"}
              className="min-h-11 w-full rounded-lg border border-border bg-bg-surface px-3 text-body"
            >
              <option value="relaxed">{t("pace_relaxed")}</option>
              <option value="balanced">{t("pace_balanced")}</option>
              <option value="full">{t("pace_full")}</option>
            </select>
          </Field>

          {/*
           * Mobility drives buffers and the physical-load check (PRD-PLAN-005,
           * PRD-HLTH-005). It is asked here rather than inferred, and it stays on the
           * device: this form does not write to traveler_profiles, and nothing in Ops can
           * ever read it (PRD-PRIV-002).
           */}
          <Field
            label={tPlan("mobility_question")}
            htmlFor="mobility"
            hint={tPlan("mobility_hint")}
          >
            <select
              id="mobility"
              name="mobility"
              defaultValue={query.mobility ?? "full"}
              className="min-h-11 w-full rounded-lg border border-border bg-bg-surface px-3 text-body"
            >
              <option value="full">{tPlan("mobility_none")}</option>
              <option value="limited_walking">{t("mobility_limited_walking")}</option>
              <option value="wheelchair">{t("mobility_wheelchair")}</option>
              <option value="needs_rest_frequently">{t("mobility_needs_rest_frequently")}</option>
            </select>
          </Field>
        </Fieldset>

        <button
          type="submit"
          className="focus-ring min-h-11 rounded-lg bg-brand-primary px-4 text-body font-medium text-text-on-primary"
        >
          {t("build")}
        </button>
      </form>
    </main>
  );
}

function Fieldset({
  legend,
  hint,
  children,
}: {
  legend: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-h2">{legend}</legend>
      {hint ? <p className="text-body-sm text-text-secondary">{hint}</p> : null}
      {children}
    </fieldset>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-caption font-medium text-text-secondary">
        {label}
      </label>
      {children}
      {hint ? <p className="text-caption text-text-secondary">{hint}</p> : null}
    </div>
  );
}
