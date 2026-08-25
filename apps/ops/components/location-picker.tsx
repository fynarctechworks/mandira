"use client";

import { Button } from "@mandhira/ui";
import { useState } from "react";
import { searchPlaces } from "@/app/(ops)/destinations/actions";

type Coordinates = { latitude: number | null; longitude: number | null };

/**
 * Coordinate picker: search by name via the GeocodingProvider, or type coordinates.
 *
 * The map itself (MapLibre) is deliberately NOT rendered here yet. It needs a tile source,
 * and `NEXT_PUBLIC_MAPTILER_KEY` is not yet provisioned (OPEN_ITEMS ACCT-03). Rather than
 * ship a map component that cannot be run — and therefore cannot be tested — this gives
 * operators a working way to set a pin now, and the map lands in B-020 alongside the rest
 * of the mapping work, where it can be verified against real tiles.
 *
 * Coordinates are shown as plain numbers on purpose: an operator pasting from a source
 * usually has decimal degrees to hand.
 */
export function LocationPicker({
  value,
  onChange,
  country,
  describedBy,
}: {
  value: Coordinates;
  onChange: (next: Coordinates) => void;
  country?: string;
  describedBy?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ label: string; latitude: number; longitude: number }[]>(
    [],
  );
  const [state, setState] = useState<"idle" | "searching" | "none" | "problem">("idle");

  async function runSearch() {
    if (query.trim().length < 3) return;
    setState("searching");

    const result = await searchPlaces({ query, ...(country ? { country } : {}) });
    if (!result.ok) {
      setState("problem");
      setResults([]);
      return;
    }

    setResults(result.data.results);
    setState(result.data.results.length === 0 ? "none" : "idle");
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-body-sm font-medium">Centre point</legend>

      <div className="flex gap-2">
        <input
          type="search"
          value={query}
          placeholder="Search by name, e.g. Kashi Vishwanath Temple"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Enter must not submit the surrounding form — this is a nested search.
            if (e.key === "Enter") {
              e.preventDefault();
              void runSearch();
            }
          }}
          aria-label="Search for a location"
          {...(describedBy ? { "aria-describedby": describedBy } : {})}
          className="focus-ring min-h-11 flex-1 rounded-input border border-border-subtle bg-surface px-3 text-body"
        />
        <Button
          type="button"
          variant="secondary"
          loading={state === "searching"}
          onClick={() => void runSearch()}
        >
          Search
        </Button>
      </div>

      {state === "none" ? (
        <p role="status" className="text-body-sm text-text-secondary">
          No matches. Try a shorter name, or enter coordinates directly.
        </p>
      ) : null}
      {state === "problem" ? (
        <p role="status" className="text-body-sm text-status-tight">
          The location search is unavailable right now. You can still enter coordinates directly.
        </p>
      ) : null}

      {results.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {results.map((result) => (
            <li key={`${result.latitude},${result.longitude}`}>
              <button
                type="button"
                onClick={() => {
                  onChange({ latitude: result.latitude, longitude: result.longitude });
                  setResults([]);
                  setQuery(result.label);
                }}
                className="focus-ring w-full rounded-button px-3 py-2 text-left text-body-sm hover:bg-surface-raised"
              >
                {result.label}
                <span className="block text-caption text-text-tertiary">
                  {result.latitude.toFixed(5)}, {result.longitude.toFixed(5)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1 text-body-sm">
          Latitude
          <input
            type="number"
            step="any"
            inputMode="decimal"
            value={value.latitude ?? ""}
            onChange={(e) =>
              onChange({
                ...value,
                latitude: e.target.value === "" ? null : Number(e.target.value),
              })
            }
            className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-body-sm">
          Longitude
          <input
            type="number"
            step="any"
            inputMode="decimal"
            value={value.longitude ?? ""}
            onChange={(e) =>
              onChange({
                ...value,
                longitude: e.target.value === "" ? null : Number(e.target.value),
              })
            }
            className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body"
          />
        </label>
      </div>

      <p className="text-caption text-text-tertiary">
        Map confirmation arrives with the mapping work (B-020). Coordinates set here are already
        used by the engine.
      </p>
    </fieldset>
  );
}
