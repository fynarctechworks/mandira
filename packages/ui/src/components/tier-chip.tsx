import { CircleDashed, Lock, Shield, Star } from "lucide-react";
import type { ComponentProps, ComponentType } from "react";
import { cn } from "../lib/cn";

/** PRD 3 / 12.1: the four user-set priority tiers. */
export type PriorityTier = "FIXED" | "PROTECTED" | "IMPORTANT" | "OPTIONAL";

/**
 * Icon per tier is normative (PRD 12.1 tier table): lock / shield / star / circle-dashed.
 * Icon AND label always ship together — never colour alone (PRD 12.8).
 */
const TIER_CONFIG: Record<
  PriorityTier,
  { icon: ComponentType<{ className?: string }>; className: string }
> = {
  FIXED: { icon: Lock, className: "bg-tier-fixed-fill text-tier-fixed-text" },
  PROTECTED: { icon: Shield, className: "bg-tier-protected-fill text-tier-protected-text" },
  IMPORTANT: { icon: Star, className: "bg-tier-important-fill text-tier-important-text" },
  OPTIONAL: { icon: CircleDashed, className: "bg-tier-optional-fill text-tier-optional-text" },
};

type TierChipProps = Omit<ComponentProps<"button">, "children"> & {
  tier: PriorityTier;
  /** Localised label; defaults to the tier keyword itself. */
  label?: string | undefined;
  /** Non-interactive display (e.g. inside a read-only summary). */
  readOnly?: boolean | undefined;
};

export function TierChip({ tier, label, readOnly = false, className, ...props }: TierChipProps) {
  const { icon: Icon, className: tierClassName } = TIER_CONFIG[tier];
  const text = label ?? tier;

  // 24 px chip (PRD 12.5). Interactive chips get a 44 px tap target via padding on a
  // wrapper-free approach: min-height stays 24 px visually, touch-action padding is added
  // by the parent list. Tappable chips open the tier picker.
  const content = (
    <>
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="truncate">{text}</span>
    </>
  );

  const chipClass = cn(
    "inline-flex min-h-6 items-center gap-1 rounded-chip px-2 py-0.5 text-caption font-medium tracking-[0.06em]",
    tierClassName,
    className,
  );

  if (readOnly) {
    return <span className={chipClass}>{content}</span>;
  }

  return (
    <button type="button" className={cn(chipClass, "focus-ring cursor-pointer")} {...props}>
      {content}
    </button>
  );
}

export { TIER_CONFIG };
export type { TierChipProps };
