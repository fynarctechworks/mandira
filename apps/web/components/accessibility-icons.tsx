import { Accessibility, Armchair, HandHelping, MoveHorizontal } from "lucide-react";
import type { ComponentType } from "react";

import type { AccessibilityIcon } from "../lib/present";

const ICONS: Record<AccessibilityIcon["key"], ComponentType<{ className?: string }>> = {
  step_free: MoveHorizontal,
  wheelchair: Accessibility,
  rest_seating: Armchair,
  queue_assistance: HandHelping,
};

/**
 * PRD F2's accessibility icon set, and PRD-DSGN: icon plus text, never icon alone.
 *
 * `partial` gets its own word rather than being rounded to yes or no — for a wheelchair
 * user "a ramp on one side and steps elsewhere" is the whole answer, and either rounding
 * loses it. An unrecorded field is absent from the list entirely (D-080).
 */
export function AccessibilityIcons({ icons }: { icons: AccessibilityIcon[] }) {
  if (icons.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1" aria-label="Accessibility">
      {icons.map((icon) => {
        const Icon = ICONS[icon.key];
        return (
          <li
            key={icon.key}
            className={`flex items-center gap-1 text-caption ${
              icon.value === "no" ? "text-text-secondary" : "text-text-primary"
            }`}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            <span>
              {icon.label}
              {icon.value === "partial" ? " — partly" : null}
              {icon.value === "no" ? " — no" : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
