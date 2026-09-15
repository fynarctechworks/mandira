"use client";

import { Button } from "@mandhira/ui";
import { useState } from "react";
import { saveDestinationLinks } from "@/app/(ops)/destinations/actions";
import { I18nFields, type LocaleOption } from "./i18n-fields";

export type NearbyLink = {
  nearby_destination_id: string;
  label: string;
  note_i18n: Record<string, string>;
};

/**
 * "Nearby meaningful places" curation (PRD F2, F19, OPS-REL-01).
 *
 * The traveler destination page shows a link only when both destinations are published
 * (0044), with the note an operator writes here. Nothing saves until Save.
 */
export function NearbyDestinations({
  destinationId,
  locales,
  options,
  initial,
}: {
  destinationId: string;
  locales: LocaleOption[];
  options: { id: string; label: string }[];
  initial: NearbyLink[];
}) {
  const [links, setLinks] = useState<NearbyLink[]>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const unused = options.filter(
    (option) => !links.some((link) => link.nearby_destination_id === option.id),
  );

  function change(next: (current: NearbyLink[]) => NearbyLink[]) {
    setLinks(next);
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setProblem(null);

    const result = await saveDestinationLinks({
      destination_id: destinationId,
      links: links.map((link) => ({
        nearby_destination_id: link.nearby_destination_id,
        note_i18n: link.note_i18n,
      })),
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
      aria-labelledby="nearby-destinations-heading"
      className="flex flex-col gap-4 rounded-card border border-border-subtle bg-surface p-4"
    >
      <div>
        <h2 id="nearby-destinations-heading" className="text-h3">
          Nearby destinations
        </h2>
        <p className="mt-1 text-body-sm text-text-secondary">
          Places a pilgrim here often goes on to. Travelers see a link only when both destinations
          are published, with the note under it.
        </p>
      </div>

      {links.length === 0 ? (
        <p className="text-body-sm text-text-tertiary">No nearby destinations yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {links.map((link) => (
            <li
              key={link.nearby_destination_id}
              className="flex flex-col gap-2 rounded-button border border-border-subtle p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-body-sm font-medium">{link.label}</span>
                <button
                  type="button"
                  onClick={() =>
                    change((current) =>
                      current.filter(
                        (item) => item.nearby_destination_id !== link.nearby_destination_id,
                      ),
                    )
                  }
                  aria-label={`Remove ${link.label}`}
                  className="focus-ring min-h-11 px-2 text-body-sm text-brand-primary-text"
                >
                  Remove
                </button>
              </div>
              <I18nFields
                label={`Note about ${link.label}`}
                locales={locales}
                value={link.note_i18n}
                onChange={(value) =>
                  change((current) =>
                    current.map((item) =>
                      item.nearby_destination_id === link.nearby_destination_id
                        ? { ...item, note_i18n: value }
                        : item,
                    ),
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}

      {unused.length > 0 ? (
        <label className="flex flex-col gap-1 text-body-sm font-medium">
          Add a nearby destination
          <select
            value=""
            onChange={(event) => {
              const option = unused.find((item) => item.id === event.target.value);
              if (!option) return;
              change((current) => [
                ...current,
                { nearby_destination_id: option.id, label: option.label, note_i18n: {} },
              ]);
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
          Save nearby destinations
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
