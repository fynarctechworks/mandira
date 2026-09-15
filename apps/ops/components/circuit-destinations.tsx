"use client";

import { Button } from "@mandhira/ui";
import { useState } from "react";
import { setCircuitDestinations } from "@/app/(ops)/circuits/actions";

export type CircuitMember = { destination_id: string; label: string };

/**
 * A circuit's destinations, in order (PRD F19 circuit builder, OPS-REL-01).
 *
 * Move up and Move down rather than drag: a circuit is short, and buttons work the same with
 * a keyboard, a screen reader or a thumb (PRD §12.8). Nothing saves until Save order — a
 * reorder is exploratory until the operator says it is done.
 */
export function CircuitDestinations({
  circuitId,
  options,
  initial,
}: {
  circuitId: string;
  options: { id: string; label: string }[];
  initial: CircuitMember[];
}) {
  const [members, setMembers] = useState<CircuitMember[]>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const unused = options.filter(
    (option) => !members.some((member) => member.destination_id === option.id),
  );

  function change(next: (current: CircuitMember[]) => CircuitMember[]) {
    setMembers(next);
    setSaved(false);
  }

  function move(index: number, by: -1 | 1) {
    change((current) => {
      const target = index + by;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setProblem(null);

    const result = await setCircuitDestinations({
      circuit_id: circuitId,
      destination_ids: members.map((member) => member.destination_id),
    });

    setSaving(false);
    if (!result.ok) {
      setProblem(Object.values(result.error.fieldErrors ?? {})[0]?.[0] ?? result.error.message);
      return;
    }
    setSaved(true);
  }

  return (
    <section
      aria-labelledby="circuit-order-heading"
      className="flex flex-col gap-4 rounded-card border border-border-subtle bg-surface p-4"
    >
      <div>
        <h2 id="circuit-order-heading" className="text-h3">
          Destinations in order
        </h2>
        <p className="mt-1 text-body-sm text-text-secondary">
          In the order a pilgrim travels them. Nothing saves until you tap Save order.
        </p>
      </div>

      {members.length === 0 ? (
        <p className="text-body-sm text-text-tertiary">No destinations yet.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {members.map((member, index) => (
            <li
              key={member.destination_id}
              className="flex flex-wrap items-center gap-2 rounded-button border border-border-subtle bg-surface px-3 py-2"
            >
              <span className="w-6 shrink-0 text-body-sm text-text-tertiary">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate text-body-sm">{member.label}</span>
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label={`Move ${member.label} up`}
                className="focus-ring min-h-11 px-2 text-body-sm text-brand-primary-text disabled:text-text-tertiary"
              >
                Up
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === members.length - 1}
                aria-label={`Move ${member.label} down`}
                className="focus-ring min-h-11 px-2 text-body-sm text-brand-primary-text disabled:text-text-tertiary"
              >
                Down
              </button>
              <button
                type="button"
                onClick={() =>
                  change((current) =>
                    current.filter((item) => item.destination_id !== member.destination_id),
                  )
                }
                aria-label={`Remove ${member.label}`}
                className="focus-ring min-h-11 px-2 text-body-sm text-brand-primary-text"
              >
                Remove
              </button>
            </li>
          ))}
        </ol>
      )}

      {unused.length > 0 ? (
        <label className="flex flex-col gap-1 text-body-sm font-medium">
          Add a destination
          <select
            value=""
            onChange={(event) => {
              const option = unused.find((item) => item.id === event.target.value);
              if (!option) return;
              change((current) => [...current, { destination_id: option.id, label: option.label }]);
            }}
            className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
          >
            <option value="">Choose a destination…</option>
            {unused.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {problem ? (
        <p role="alert" className="text-body-sm text-status-tight">
          {problem}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="button" loading={saving} onClick={() => void save()}>
          Save order
        </Button>
        {saved ? (
          <span role="status" className="text-body-sm text-status-comfortable">
            ● Saved
          </span>
        ) : null}
      </div>
    </section>
  );
}
