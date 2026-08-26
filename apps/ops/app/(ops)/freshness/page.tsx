import { FreshnessMonitor, type FreshnessRow } from "@/components/freshness-monitor";
import { opsSupabase } from "@/lib/supabase";

export const metadata = { title: "Freshness · Mandhira Ops" };
export const dynamic = "force-dynamic";

/** PRD F18's five filters, verbatim, plus the unfiltered view. */
const FILTERS = [
  { value: "all", label: "Everything" },
  { value: "stale", label: "Stale" },
  { value: "aging", label: "Aging" },
  { value: "expiring30", label: "Expiring within 30 days" },
  { value: "low", label: "Low confidence" },
  { value: "conflict", label: "Conflicted" },
] as const;

type Filter = (typeof FILTERS)[number]["value"];

/**
 * O15 — the Freshness monitor (PRD F18, PRD-OPS-WF-006).
 *
 * Every row is a published critical field: something a traveler is being shown right now,
 * with a confidence badge derived from how long ago somebody last checked it. Nothing here
 * is broken — that is the point. This is the queue that exists so knowledge does not rot
 * quietly while every screen keeps saying "Verified".
 *
 * A GET form, like search and the brief (D-089): the filter is in the URL, so a view of
 * "everything stale in Devagiri" is a link somebody can send to whoever is doing the
 * checking this week.
 */
export default async function FreshnessPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; destination?: string }>;
}) {
  const query = await searchParams;
  const filter = (FILTERS.find((f) => f.value === query.filter)?.value ?? "all") as Filter;

  const supabase = await opsSupabase();

  const [{ data: rows, error }, { data: destinations }] = await Promise.all([
    supabase.rpc("freshness_rows", {
      p_filter: filter,
      ...(query.destination ? { p_destination_id: query.destination } : {}),
    }),
    supabase.from("destinations").select("id, name_i18n").order("slug"),
  ]);

  const list = (rows ?? []) as FreshnessRow[];
  const stale = list.filter((row) => row.freshness === "stale").length;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-h1">Freshness</h1>
        <p className="text-body text-text-secondary">
          Published critical fields, worst first. Every row is something a traveler is being
          shown right now, with the date somebody last checked it against a source.
        </p>
        {stale > 0 ? (
          <p className="text-body-sm text-text-secondary">
            {stale} {stale === 1 ? "field is" : "fields are"} stale — verified more than six
            months ago, or past the date their source vouched for.
          </p>
        ) : null}
      </header>

      {/*
        A GET form. The filter lives in the URL so a view of "everything stale in Devagiri"
        is a link that can be sent to whoever is checking this week (D-089).
      */}
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-body-sm font-medium">
          Show
          <select
            name="filter"
            defaultValue={filter}
            className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
          >
            {FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-body-sm font-medium">
          Destination
          <select
            name="destination"
            defaultValue={query.destination ?? ""}
            className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
          >
            <option value="">Everywhere</option>
            {(destinations ?? []).map((destination) => (
              <option key={destination.id} value={destination.id}>
                {(destination.name_i18n as Record<string, string>)["en"] ?? destination.id}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          className="focus-ring min-h-11 rounded-lg border border-border px-4 text-body-sm font-medium"
        >
          Apply
        </button>
      </form>

      {error ? (
        <p role="alert" className="text-body text-status-tight">
          That list didn&apos;t load. Please refresh to try again.
        </p>
      ) : list.length === 0 ? (
        <p className="text-body text-text-secondary">
          {filter === "all"
            ? "Nothing published here has a critical field yet, so there is nothing to keep an eye on."
            : "Nothing matches that filter. That is the healthy state, not an empty one."}
        </p>
      ) : (
        <FreshnessMonitor rows={list} />
      )}
    </div>
  );
}
