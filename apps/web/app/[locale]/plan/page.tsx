import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

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

export default async function PlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ destination?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { destination: destinationSlug } = await searchParams;
  const destinations = await getDestinationCards(locale, 20);

  if (destinations.length === 0) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-6">
        <h1 className="text-display">Plan a journey</h1>
        <p className="text-body text-text-secondary">
          There are no published destinations yet, so there is nothing to plan around. This screen
          will do something the moment there is.
        </p>
      </main>
    );
  }

  const chosen = destinationSlug ?? destinations[0]!.slug;
  const page = await getDestinationPage(chosen, locale);
  if (!page) notFound();

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-display">Plan a journey</h1>
        <p className="text-body text-text-secondary">
          Tell Mandhira what the journey has to include. It works out whether the days hold together
          — and tells you when they do not.
        </p>
      </header>

      {/*
       * A GET form, like search (D-089). The brief ends up in the URL, so a half-finished
       * plan survives a reload and can be sent to whoever is coming along.
       */}
      <form method="get" action={`/${locale}/plan/preview`} className="flex flex-col gap-6">
        <Fieldset legend="Where and when" hint="The only two things Mandhira needs.">
          <Field label="Destination" htmlFor="destination">
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

          <Field label="Starting on" htmlFor="start">
            <input
              id="start"
              name="start"
              type="date"
              required
              className="min-h-11 w-full rounded-lg border border-border bg-bg-surface px-3 text-body"
            />
          </Field>

          <Field label="How many days" htmlFor="days">
            <select
              id="days"
              name="days"
              defaultValue="3"
              className="min-h-11 w-full rounded-lg border border-border bg-bg-surface px-3 text-body"
            >
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "day" : "days"}
                </option>
              ))}
            </select>
          </Field>
        </Fieldset>

        <Fieldset
          legend="What you must do"
          hint="Mandhira never removes these, and never moves them without asking."
        >
          {page.experiences.length === 0 ? (
            <p className="text-body-sm text-text-secondary">Nothing has been published here yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {page.experiences.map((experience) => (
                <li key={experience.id}>
                  <label className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-bg-surface px-3 py-2">
                    <input
                      type="checkbox"
                      name="must"
                      value={experience.id}
                      className="size-5 shrink-0"
                    />
                    <span className="text-body">{experience.name.text}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </Fieldset>

        <Fieldset
          legend="What you would like to do"
          hint="Mandhira may suggest moving these — never without asking."
        >
          <ul className="flex flex-col gap-2">
            {page.experiences.map((experience) => (
              <li key={experience.id}>
                <label className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-bg-surface px-3 py-2">
                  <input
                    type="checkbox"
                    name="like"
                    value={experience.id}
                    className="size-5 shrink-0"
                  />
                  <span className="text-body">{experience.name.text}</span>
                </label>
              </li>
            ))}
          </ul>
        </Fieldset>

        <Fieldset legend="How you travel" hint="Everything here can be skipped.">
          <Field label="Pace" htmlFor="pace">
            <select
              id="pace"
              name="pace"
              defaultValue="balanced"
              className="min-h-11 w-full rounded-lg border border-border bg-bg-surface px-3 text-body"
            >
              <option value="relaxed">Relaxed — leave room to breathe</option>
              <option value="balanced">Balanced</option>
              <option value="full">Full — fit in as much as the day allows</option>
            </select>
          </Field>

          {/*
           * Mobility drives buffers and the physical-load check (PRD-PLAN-005,
           * PRD-HLTH-005). It is asked here rather than inferred, and it stays on the
           * device: this form does not write to traveler_profiles, and nothing in Ops can
           * ever read it (PRD-PRIV-002).
           */}
          <Field
            label="Is anyone travelling with a mobility need?"
            htmlFor="mobility"
            hint="This changes how much time Mandhira leaves between things."
          >
            <select
              id="mobility"
              name="mobility"
              defaultValue="full"
              className="min-h-11 w-full rounded-lg border border-border bg-bg-surface px-3 text-body"
            >
              <option value="full">No — everyone walks freely</option>
              <option value="limited_walking">Someone cannot walk far</option>
              <option value="wheelchair">Someone uses a wheelchair</option>
              <option value="needs_rest_frequently">Someone needs to rest often</option>
            </select>
          </Field>
        </Fieldset>

        <button
          type="submit"
          className="focus-ring min-h-11 rounded-lg bg-brand-primary px-4 text-body font-medium text-brand-primary-on"
        >
          Build my journey
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
