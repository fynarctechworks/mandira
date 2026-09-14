"use client";

import { Button } from "@mandhira/ui";
import { useState } from "react";
import { archiveGuidanceBlock, saveGuidanceBlock } from "@/app/(ops)/guidance/actions";
import { I18nFields, type LocaleOption } from "./i18n-fields";
import { PublishStatusTag } from "./publish-status-tag";

const GUIDANCE_TYPES = [
  { value: "before_you_go", label: "Before you go" },
  { value: "what_to_carry", label: "What to carry" },
  { value: "etiquette", label: "Etiquette" },
  { value: "timing_tip", label: "Timing tip" },
  { value: "safety", label: "Safety" },
  { value: "family", label: "Travelling with family" },
  { value: "accessibility", label: "Accessibility" },
] as const;

export type GuidanceTarget = {
  table: "destinations" | "places" | "experiences";
  id: string;
  label: string;
};

export type GuidanceRow = {
  id: string;
  guidance_type: string;
  body_i18n: Record<string, string>;
  applies_to_table: string;
  applies_to_id: string;
  sort_order: number;
  status: string;
};

export function GuidanceEditor({
  locales,
  targets,
  blocks,
}: {
  locales: LocaleOption[];
  targets: GuidanceTarget[];
  blocks: GuidanceRow[];
}) {
  const [type, setType] = useState<string>("what_to_carry");
  const [targetKey, setTargetKey] = useState(
    targets[0] ? `${targets[0].table}:${targets[0].id}` : "",
  );
  const [body, setBody] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const labelFor = (row: GuidanceRow) =>
    targets.find((t) => t.table === row.applies_to_table && t.id === row.applies_to_id)?.label ??
    "(archived target)";

  async function add() {
    const [table, id] = targetKey.split(":");
    if (!table || !id) return;

    setBusy(true);
    setProblem(null);

    const result = await saveGuidanceBlock({
      guidance_type: type,
      body_i18n: body,
      applies_to_table: table,
      applies_to_id: id,
      sort_order: 0,
    });

    setBusy(false);
    if (!result.ok) {
      setProblem(Object.values(result.error.fieldErrors ?? {})[0]?.[0] ?? result.error.message);
      return;
    }
    window.location.reload();
  }

  async function archive(id: string) {
    await archiveGuidanceBlock({ id });
    window.location.reload();
  }

  if (targets.length === 0) {
    return (
      <p className="text-body text-text-secondary">
        Guidance attaches to a destination, place or experience — create one of those first.
      </p>
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      {blocks.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {blocks.map((block) => (
            <li
              key={block.id}
              className="flex items-start justify-between gap-3 rounded-card border border-border-subtle bg-surface p-3"
            >
              <div className="min-w-0">
                <p className="text-body-sm font-medium">
                  {GUIDANCE_TYPES.find((t) => t.value === block.guidance_type)?.label ??
                    block.guidance_type}
                  <span className="ml-2 font-normal text-text-tertiary">{labelFor(block)}</span>
                </p>
                <p className="mt-1 line-clamp-2 text-body-sm text-text-secondary">
                  {block.body_i18n["en"] ?? Object.values(block.body_i18n)[0] ?? ""}
                </p>
                <p className="mt-1 text-caption">
                  <PublishStatusTag status={block.status} />
                </p>
              </div>
              <Button type="button" variant="tertiary" onClick={() => void archive(block.id)}>
                Archive
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body-sm text-text-tertiary">No guidance written yet.</p>
      )}

      <section className="flex flex-col gap-3 rounded-card border border-border-subtle bg-surface p-4">
        <h2 className="text-h3">Add guidance</h2>

        <div className="flex flex-wrap gap-3">
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-body-sm font-medium">
            Kind
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
            >
              {GUIDANCE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex min-w-48 flex-1 flex-col gap-1 text-body-sm font-medium">
            Applies to
            <select
              value={targetKey}
              onChange={(e) => setTargetKey(e.target.value)}
              className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
            >
              {targets.map((target) => (
                <option key={`${target.table}:${target.id}`} value={`${target.table}:${target.id}`}>
                  {target.label} ({target.table.replace(/s$/, "")})
                </option>
              ))}
            </select>
          </label>
        </div>

        <I18nFields label="Guidance" locales={locales} multiline value={body} onChange={setBody} />

        {problem ? (
          <p role="alert" className="text-body-sm text-status-tight">
            {problem}
          </p>
        ) : null}

        <div>
          <Button type="button" loading={busy} onClick={() => void add()}>
            Add guidance
          </Button>
        </div>
      </section>
    </div>
  );
}
