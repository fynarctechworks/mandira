import { AlertTriangle, Check, CircleDot } from "lucide-react";
import type { ComponentProps, ComponentType } from "react";
import { cn } from "../lib/cn";

/**
 * PRD F9 trust badge states. Mapping is normative:
 *   verified        - confidence high
 *   verified_earlier- confidence medium (aging or T3)
 *   check_locally   - confidence low, or conflict_flag, or stale
 * Never render a confidence percentage; never hide a low-confidence badge.
 */
export type TrustState = "verified" | "verified_earlier" | "check_locally";

const TRUST_CONFIG: Record<
  TrustState,
  { icon: ComponentType<{ className?: string }>; className: string; defaultLabel: string }
> = {
  verified: { icon: Check, className: "text-status-comfortable", defaultLabel: "Verified" },
  verified_earlier: {
    icon: CircleDot,
    className: "text-status-tight",
    defaultLabel: "Verified earlier",
  },
  check_locally: {
    icon: AlertTriangle,
    className: "text-status-broken",
    defaultLabel: "Check locally",
  },
};

type TrustBadgeProps = Omit<ComponentProps<"button">, "children"> & {
  state: TrustState;
  /** Localised word; defaults to the PRD English wording. */
  label?: string | undefined;
};

/** 20 px icon + word. Tap/long-press opens the Trust sheet (PRD F9). */
export function TrustBadge({ state, label, className, ...props }: TrustBadgeProps) {
  const { icon: Icon, className: stateClassName, defaultLabel } = TRUST_CONFIG[state];

  return (
    <button
      type="button"
      className={cn(
        "focus-ring inline-flex min-h-11 items-center gap-1 rounded-chip text-body-sm font-medium",
        stateClassName,
        className,
      )}
      {...props}
    >
      <Icon aria-hidden="true" className="size-5 shrink-0" />
      <span>{label ?? defaultLabel}</span>
    </button>
  );
}

export { TRUST_CONFIG };
export type { TrustBadgeProps };
