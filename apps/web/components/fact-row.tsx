import { useTranslations } from "next-intl";

import type { Text } from "../lib/knowledge";
import type { TrustEntry } from "../lib/trust";
import { FieldTrust } from "./field-trust";

/**
 * One fact, with the badge for that specific field beside it (PRD F9).
 *
 * This is what the card-level summary in D-083 was standing in for. A card takes the
 * weakest state across everything; here each field carries its own, so a traveler can see
 * that the opening hours are solid and it is the entry requirements nobody has checked
 * recently — which is the difference between "be careful" and "check this one thing".
 *
 * Renders nothing at all when the value is empty. A row reading "Dress code: —" occupies
 * the same space as an answer and tells a traveler they have been told something.
 *
 * STRUCTURE MATTERS HERE: a `<dl>` permits at most ONE wrapping `<div>` around its
 * `<dt>`/`<dd>` pair, so the badge lives inside the `<dt>` rather than in a flex wrapper
 * of its own. An earlier version nested them two divs deep and axe caught it — which is
 * the kind of thing that reads fine and is unusable with a screen reader.
 */
export function FactRow({
  label,
  value,
  trust,
  lastConfirmed,
  validUntil,
}: {
  label: string;
  value: Text | string | null;
  trust?: TrustEntry | undefined;
  lastConfirmed?: string;
  validUntil?: string | undefined;
}) {
  const t = useTranslations("phrases");
  const text = typeof value === "string" ? value : (value?.text ?? "");
  if (!text.trim()) return null;

  const isFallback = typeof value === "object" && value !== null && value.isFallback;

  return (
    <div className="border-b border-border py-3 last:border-b-0">
      <dt className="flex items-start justify-between gap-3 text-caption font-medium text-text-secondary">
        <span>{label}</span>
        {trust && lastConfirmed ? (
          <FieldTrust
            entry={trust}
            fieldLabel={label}
            lastConfirmed={lastConfirmed}
            validUntil={validUntil}
          />
        ) : null}
      </dt>
      <dd className="mt-1 text-body">
        {text}
        {isFallback ? (
          <span className="mt-1 block text-caption text-text-secondary">
            {t("not_in_language")}
          </span>
        ) : null}
      </dd>
    </div>
  );
}
