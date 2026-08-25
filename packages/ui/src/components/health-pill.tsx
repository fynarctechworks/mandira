import { AlertTriangle, CheckCircle2, Clock, XOctagon } from "lucide-react";
import type { ComponentProps, ComponentType } from "react";
import { cn } from "../lib/cn";

/** PRD F5 Journey Health states. */
export type HealthState = "comfortable" | "tight" | "at_risk" | "broken";

/**
 * Fill is the status colour at 12% (PRD 12.5); the text uses the full-strength colour so the
 * word stays legible. Icon AND word always ship together (PRD 12.8).
 */
const HEALTH_CONFIG: Record<
  HealthState,
  {
    icon: ComponentType<{ className?: string }>;
    text: string;
    fill: string;
    defaultLabel: string;
  }
> = {
  comfortable: {
    icon: CheckCircle2,
    text: "text-status-comfortable",
    fill: "bg-status-comfortable/12",
    defaultLabel: "Comfortable",
  },
  tight: {
    icon: Clock,
    text: "text-status-tight",
    fill: "bg-status-tight/12",
    defaultLabel: "Tight",
  },
  at_risk: {
    icon: AlertTriangle,
    text: "text-status-at-risk",
    fill: "bg-status-at-risk/12",
    defaultLabel: "At risk",
  },
  broken: {
    icon: XOctagon,
    text: "text-status-broken",
    fill: "bg-status-broken/12",
    defaultLabel: "Broken",
  },
};

type HealthPillProps = Omit<ComponentProps<"span">, "children"> & {
  state: HealthState;
  /** Localised state word; defaults to the PRD English wording. */
  label?: string | undefined;
};

/** 32 px pill; colour changes crossfade over 250 ms, no pulsing (PRD 12.6). */
export function HealthPill({ state, label, className, ...props }: HealthPillProps) {
  const { icon: Icon, text, fill, defaultLabel } = HEALTH_CONFIG[state];

  return (
    <span
      className={cn(
        "inline-flex min-h-8 items-center gap-1.5 rounded-chip px-3 text-body-sm font-medium",
        "transition-colors duration-(--duration-sheet) ease-(--ease-standard)",
        fill,
        text,
        className,
      )}
      {...props}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span>{label ?? defaultLabel}</span>
    </span>
  );
}

export { HEALTH_CONFIG };
export type { HealthPillProps };
