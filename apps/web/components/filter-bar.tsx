import { getTranslations } from "next-intl/server";

import { EXPERIENCE_TYPES, PLACE_TYPES, type SearchFilters } from "../lib/knowledge";

/**
 * PRD F2's six filters: type, duration, booking, access, availability on a date, and near a
 * journey.
 *
 * Plain form fields, no client JavaScript: the whole search screen is a GET form, so the
 * filters survive a reload, a share, and a browser with nothing running.
 *
 * "Near a journey" needs a saved journey to be near. Without one the traveler is told how to
 * get one, rather than shown a control that can never match anything.
 */
export async function FilterBar({
  filters,
  journeys,
}: {
  filters: SearchFilters;
  /** The traveler's journeys still ahead, or null for a guest. */
  journeys: { id: string; title: string | null }[] | null;
}) {
  const t = await getTranslations("searchFilters");
  const tJourney = await getTranslations("addToJourney");
  const tSearch = await getTranslations("search");
  const tFields = await getTranslations("knowledgeFields");
  // A type added to the schema before the catalogs still reads as words, not as a key path.
  const typeLabel = (value: string) =>
    t.has(`type_options.${value}`) ? t(`type_options.${value}`) : humanise(value);

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="sr-only">{t("legend")}</legend>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t("type")} htmlFor="type">
          <select
            id="type"
            name="type"
            defaultValue={filters.type ?? ""}
            className="min-h-11 w-full rounded-lg border border-border bg-bg-surface px-3 text-body-sm"
          >
            <option value="">{t("type_any")}</option>
            <optgroup label={tSearch("experiences")}>
              {EXPERIENCE_TYPES.map((value) => (
                <option key={value} value={value}>
                  {typeLabel(value)}
                </option>
              ))}
            </optgroup>
            <optgroup label={tSearch("places")}>
              {PLACE_TYPES.map((value) => (
                <option key={value} value={value}>
                  {typeLabel(value)}
                </option>
              ))}
            </optgroup>
          </select>
        </Field>

        <Field label={t("how_long")} htmlFor="duration">
          <select
            id="duration"
            name="duration"
            defaultValue={filters.maxDurationMinutes?.toString() ?? ""}
            className="min-h-11 w-full rounded-lg border border-border bg-bg-surface px-3 text-body-sm"
          >
            <option value="">{t("any_length")}</option>
            <option value="30">{t("up_to_30")}</option>
            <option value="60">{t("up_to_60")}</option>
            <option value="120">{t("up_to_120")}</option>
            <option value="240">{t("up_to_240")}</option>
          </select>
        </Field>

        <Field label={tFields("booking")} htmlFor="booking">
          <select
            id="booking"
            name="booking"
            defaultValue={
              filters.advanceBooking === true ? "yes" : filters.advanceBooking === false ? "no" : ""
            }
            className="min-h-11 w-full rounded-lg border border-border bg-bg-surface px-3 text-body-sm"
          >
            <option value="">{t("either_way")}</option>
            <option value="no">{t("no_booking")}</option>
            <option value="yes">{t("needs_booking")}</option>
          </select>
        </Field>

        <Field label={tFields("getting_in")} htmlFor="access">
          <select
            id="access"
            name="access"
            defaultValue={filters.stepFreeOnly ? "step_free" : ""}
            className="min-h-11 w-full rounded-lg border border-border bg-bg-surface px-3 text-body-sm"
          >
            <option value="">{t("access_any")}</option>
            {/*
             * "or partly" is in the label on purpose. A ramp on one side and steps
             * elsewhere is a match worth showing to the person who needs the ramp, and
             * the card still says "partly" so nobody is misled into expecting more.
             */}
            <option value="step_free">{t("step_free_or_partly")}</option>
          </select>
        </Field>

        <Field label={t("on")} htmlFor="on">
          <input
            id="on"
            name="on"
            type="date"
            defaultValue={filters.availableOn ?? ""}
            className="min-h-11 w-full rounded-lg border border-border bg-bg-surface px-3 text-body-sm"
          />
        </Field>

        {journeys && journeys.length > 0 ? (
          <Field label={t("near")} htmlFor="near">
            <select
              id="near"
              name="near"
              defaultValue={filters.nearJourneyId ?? ""}
              className="min-h-11 w-full rounded-lg border border-border bg-bg-surface px-3 text-body-sm"
            >
              <option value="">{t("near_any")}</option>
              {journeys.map((journey) => (
                <option key={journey.id} value={journey.id}>
                  {journey.title ?? tJourney("untitled")}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </div>

      {journeys && journeys.length > 0 ? null : (
        <p className="text-caption text-text-secondary">
          {journeys ? t("near_hint_saved") : t("near_hint")}
        </p>
      )}
    </fieldset>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      {/*
       * `htmlFor` rather than wrapping: a <label> around a <select> pollutes the
       * accessible name with every option's text, which B-009 hit three times.
       */}
      <label htmlFor={htmlFor} className="text-caption font-medium text-text-secondary">
        {label}
      </label>
      {children}
    </div>
  );
}

/** `sacred_site` → `Sacred site`. The schema's words, in a person's sentence case. */
function humanise(value: string): string {
  const spaced = value.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
