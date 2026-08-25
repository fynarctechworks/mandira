import { EXPERIENCE_TYPES, PLACE_TYPES, type SearchFilters } from "../lib/knowledge";

/**
 * PRD F2's filters — the four that can be answered honestly today.
 *
 * F2 caps the visible filters at six. "Availability on my dates" and "Near a place I've
 * added" both need an active journey, which is B-019, so they are absent rather than
 * present and inert. A control that is always there and never works teaches a traveler
 * that the controls do not work, and they stop trying the ones that do.
 *
 * Plain form fields, no client JavaScript: the whole search screen is a GET form, so the
 * filters survive a reload, a share, and a browser with nothing running.
 */
export function FilterBar({ filters }: { filters: SearchFilters }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="sr-only">Narrow these results</legend>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Type" htmlFor="type">
          <select
            id="type"
            name="type"
            defaultValue={filters.type ?? ""}
            className="min-h-11 w-full rounded-lg border border-border bg-bg-surface px-3 text-body-sm"
          >
            <option value="">Anything</option>
            <optgroup label="Experiences">
              {EXPERIENCE_TYPES.map((value) => (
                <option key={value} value={value}>
                  {humanise(value)}
                </option>
              ))}
            </optgroup>
            <optgroup label="Places">
              {PLACE_TYPES.map((value) => (
                <option key={value} value={value}>
                  {humanise(value)}
                </option>
              ))}
            </optgroup>
          </select>
        </Field>

        <Field label="How long" htmlFor="duration">
          <select
            id="duration"
            name="duration"
            defaultValue={filters.maxDurationMinutes?.toString() ?? ""}
            className="min-h-11 w-full rounded-lg border border-border bg-bg-surface px-3 text-body-sm"
          >
            <option value="">Any length</option>
            <option value="30">Up to 30 minutes</option>
            <option value="60">Up to an hour</option>
            <option value="120">Up to two hours</option>
            <option value="240">Up to half a day</option>
          </select>
        </Field>

        <Field label="Booking" htmlFor="booking">
          <select
            id="booking"
            name="booking"
            defaultValue={
              filters.advanceBooking === true ? "yes" : filters.advanceBooking === false ? "no" : ""
            }
            className="min-h-11 w-full rounded-lg border border-border bg-bg-surface px-3 text-body-sm"
          >
            <option value="">Either way</option>
            <option value="no">No booking needed</option>
            <option value="yes">Needs booking ahead</option>
          </select>
        </Field>

        <Field label="Getting in" htmlFor="access">
          <select
            id="access"
            name="access"
            defaultValue={filters.stepFreeOnly ? "step_free" : ""}
            className="min-h-11 w-full rounded-lg border border-border bg-bg-surface px-3 text-body-sm"
          >
            <option value="">Any</option>
            {/*
             * "or partly" is in the label on purpose. A ramp on one side and steps
             * elsewhere is a match worth showing to the person who needs the ramp, and
             * the card still says "partly" so nobody is misled into expecting more.
             */}
            <option value="step_free">Step-free, or partly</option>
          </select>
        </Field>
      </div>

      <p className="text-caption text-text-secondary">
        Filtering by your dates and by what you have already added arrives with the journey builder.
      </p>
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
