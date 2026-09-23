"use client";

import { Button } from "@mandhira/ui";
import { useState } from "react";
import { deleteTransportConnection, saveTransportConnection } from "@/app/(ops)/routes/actions";
import { I18nFields, type LocaleOption } from "./i18n-fields";
import { humanLabel } from "@/lib/labels";

const MODES = ["walk", "vehicle", "public_transport", "hired", "other"] as const;

export type TransportRow = {
  id: string;
  destination_id: string;
  from_place_id: string | null;
  to_place_id: string | null;
  mode: string;
  duration_likely_minutes: number | null;
  duration_max_minutes: number | null;
  operator: string | null;
  status: string;
};

export function TransportEditor({
  locales,
  destinations,
  places,
  connections,
}: {
  locales: LocaleOption[];
  destinations: { id: string; label: string }[];
  places: { id: string; label: string }[];
  connections: TransportRow[];
}) {
  const [destinationId, setDestinationId] = useState(destinations[0]?.id ?? "");
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [mode, setMode] = useState<string>("vehicle");
  const [likely, setLikely] = useState<number | null>(null);
  const [max, setMax] = useState<number | null>(null);
  const [operator, setOperator] = useState("");
  const [frequency, setFrequency] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const placeLabel = (id: string | null) =>
    places.find((p) => p.id === id)?.label ?? "(unknown place)";

  async function add() {
    setBusy(true);
    setProblem(null);

    const result = await saveTransportConnection({
      destination_id: destinationId,
      from_place_id: fromId || null,
      to_place_id: toId || null,
      mode,
      duration_likely_minutes: likely,
      duration_max_minutes: max,
      operator: operator || null,
      frequency_note_i18n: frequency,
      booking_note_i18n: {},
    });

    setBusy(false);
    if (!result.ok) {
      setProblem(Object.values(result.error.fieldErrors ?? {})[0]?.[0] ?? result.error.message);
      return;
    }
    window.location.reload();
  }

  async function remove(id: string) {
    await deleteTransportConnection({ id });
    window.location.reload();
  }

  if (destinations.length === 0 || places.length < 2) {
    return (
      <p className="text-body text-text-secondary">
        Transport connects two places. Add at least two places to a destination first.
      </p>
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      {connections.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {connections.map((connection) => (
            <li
              key={connection.id}
              className="flex items-center justify-between gap-3 rounded-card border border-border-subtle bg-surface p-3"
            >
              <span className="min-w-0 text-body-sm">
                <span className="font-medium">
                  {placeLabel(connection.from_place_id)} → {placeLabel(connection.to_place_id)}
                </span>
                <span className="block text-caption text-text-tertiary">
                  {humanLabel(connection.mode)} ·{" "}
                  {connection.duration_likely_minutes != null
                    ? `${connection.duration_likely_minutes} min`
                    : "○ no duration — the engine can't use this yet"}
                  {connection.operator ? ` · ${connection.operator}` : ""}
                </span>
              </span>
              <Button type="button" variant="tertiary" onClick={() => void remove(connection.id)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body-sm text-text-tertiary">No connections recorded yet.</p>
      )}

      <section className="flex flex-col gap-3 rounded-card border border-border-subtle bg-surface p-4">
        <h2 className="text-h3">Add a connection</h2>

        <label className="flex flex-col gap-1 text-body-sm font-medium">
          Destination
          <select
            value={destinationId}
            onChange={(e) => setDestinationId(e.target.value)}
            className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
          >
            {destinations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap gap-3">
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-body-sm font-medium">
            From
            <select
              value={fromId}
              onChange={(e) => setFromId(e.target.value)}
              className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
            >
              <option value="">Choose…</option>
              {places.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-body-sm font-medium">
            To
            <select
              value={toId}
              onChange={(e) => setToId(e.target.value)}
              className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
            >
              <option value="">Choose…</option>
              {places.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-3">
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-body-sm font-medium">
            Mode
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
            >
              {MODES.map((m) => (
                <option key={m} value={m}>
                  {humanLabel(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-body-sm font-medium">
            Usual minutes
            <input
              type="number"
              min={1}
              value={likely ?? ""}
              onChange={(e) => setLikely(e.target.value === "" ? null : Number(e.target.value))}
              className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
            />
          </label>
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-body-sm font-medium">
            Worst case
            <input
              type="number"
              min={1}
              value={max ?? ""}
              onChange={(e) => setMax(e.target.value === "" ? null : Number(e.target.value))}
              className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-body-sm font-medium">
          Operator
          <input
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
            className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
          />
        </label>

        <I18nFields
          label="How often it runs"
          locales={locales}
          value={frequency}
          onChange={setFrequency}
        />

        {problem ? (
          <p role="alert" className="text-body-sm text-status-tight">
            {problem}
          </p>
        ) : null}

        <div>
          <Button type="button" loading={busy} onClick={() => void add()}>
            Add connection
          </Button>
        </div>
      </section>
    </div>
  );
}
