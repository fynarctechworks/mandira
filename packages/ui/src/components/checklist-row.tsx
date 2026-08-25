"use client";

import * as Checkbox from "@radix-ui/react-checkbox";
import { Check, ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "../lib/cn";

type ChecklistRowProps = {
  id?: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Content of the "Why?" expander — PRD Principle: every requirement ships a reason. */
  why?: string;
  /** Localised label for the expander control. */
  whyLabel?: string;
  className?: string;
};

/** PRD 12.5 checklist row: 44 px, 24 px checkbox, "Why?" expander. */
export function ChecklistRow({
  id,
  label,
  checked,
  onCheckedChange,
  why,
  whyLabel = "Why?",
  className,
}: ChecklistRowProps) {
  const generatedId = useId();
  const checkboxId = id ?? generatedId;
  const panelId = `${checkboxId}-why`;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn("border-b border-border-subtle py-1 last:border-b-0", className)}>
      <div className="flex min-h-11 items-center gap-3">
        <Checkbox.Root
          id={checkboxId}
          checked={checked}
          onCheckedChange={(value) => onCheckedChange(value === true)}
          className="focus-ring flex size-6 shrink-0 items-center justify-center rounded-[6px] border border-border-subtle bg-surface data-[state=checked]:border-brand-primary data-[state=checked]:bg-brand-primary"
        >
          <Checkbox.Indicator className="text-text-on-primary">
            <Check aria-hidden="true" className="size-4" />
          </Checkbox.Indicator>
        </Checkbox.Root>

        <label htmlFor={checkboxId} className="flex-1 cursor-pointer text-body">
          {label}
        </label>

        {why ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={() => setExpanded((v) => !v)}
            className="focus-ring inline-flex min-h-11 items-center gap-1 px-2 text-body-sm font-medium text-brand-primary-text"
          >
            {whyLabel}
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "size-4 transition-transform duration-(--duration-state) ease-(--ease-standard)",
                expanded && "rotate-180",
              )}
            />
          </button>
        ) : null}
      </div>

      {why ? (
        <div id={panelId} hidden={!expanded} className="pb-3 pl-9 text-body-sm text-text-secondary">
          {why}
        </div>
      ) : null}
    </div>
  );
}

export type { ChecklistRowProps };
