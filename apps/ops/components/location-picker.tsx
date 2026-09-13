"use client";

import { Button } from "@mandhira/ui";
import { useState } from "react";
import { searchPlaces } from "@/app/(ops)/destinations/actions";

type Coordinates = { latitude: number | null; longitude: number | null };

/**
 * Coordinate picker: search by name via the GeocodingProvider, or type coordinates.
 *
 * With `NEXT_PUBLIC_MAPTILER_KEY` set (ACCT-03), the chosen point is shown on a MapTiler static
 * map (MAPS-02), so an operator can see that a pin sits on the temple and not in the car park
 * across the road before it reaches a traveler. A static image rather than an interactive map:
 * it needs no map library (the Ops bundle stays as it is) and the coordinates stay the thing
 * that is edited. Without the key the picker works exactly as before.
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

      <MapPreview latitude={value.latitude} longitude={value.longitude} />
    </fieldset>
  );
}

const MAPTILER_KEY = process.env["NEXT_PUBLIC_MAPTILER_KEY"];

function MapPreview({ latitude, longitude }: Coordinates) {
  const valid =
    latitude !== null &&
    longitude !== null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180;

  if (!MAPTILER_KEY) {
    return (
      <p className="text-caption text-text-tertiary">
        A map preview appears here once a MapTiler key is configured. Coordinates set here are
        already used by the engine.
      </p>
    );
  }
  if (!valid) {
    return <p className="text-caption text-text-tertiary">Set a point to see it on the map.</p>;
  }

  const position = `${longitude.toFixed(6)},${latitude.toFixed(6)}`;
  const src =
    `https://api.maptiler.com/maps/streets-v2/static/${position},16/560x280@2x.png` +
    `?key=${encodeURIComponent(MAPTILER_KEY)}&markers=${position},%23FF660E`;

  return (
    <figure className="flex flex-col gap-1">
      {/* A static tile from an allowlisted host (CSP img-src); next/image adds nothing here. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        width={560}
        height={280}
        loading="lazy"
        alt={`Map centred on ${latitude.toFixed(5)}, ${longitude.toFixed(5)}, with the chosen point marked`}
        className="w-full max-w-[560px] rounded-card border border-border-subtle"
      />
      <figcaption className="text-caption text-text-tertiary">
        Check the marker sits on the place itself before saving. Map © MapTiler © OpenStreetMap
        contributors.
      </figcaption>
    </figure>
  );
}
