// @mandhira/ui — design tokens, fonts and the PRD §12.5 component library.

export { colorTokens, darkOverriddenTokens } from "./tokens";
export type { ColorToken } from "./tokens";
export { cn } from "./lib/cn";

export { Button, buttonVariants } from "./components/button";
export type { ButtonProps } from "./components/button";

export { TierChip, TIER_CONFIG } from "./components/tier-chip";
export type { PriorityTier, TierChipProps } from "./components/tier-chip";

export { TrustBadge, TRUST_CONFIG } from "./components/trust-badge";
export type { TrustBadgeProps, TrustState } from "./components/trust-badge";

export { TrustSheet } from "./components/trust-sheet";
export type { TrustSheetProps } from "./components/trust-sheet";

export { HealthPill, HEALTH_CONFIG } from "./components/health-pill";
export type { HealthPillProps, HealthState } from "./components/health-pill";

export { BottomSheet } from "./components/bottom-sheet";
export type { BottomSheetProps } from "./components/bottom-sheet";

export { ChecklistRow } from "./components/checklist-row";
export type { ChecklistRowProps } from "./components/checklist-row";

export { OfflineBanner } from "./components/offline-banner";
export type { OfflineBannerProps } from "./components/offline-banner";

export { ItemCard } from "./components/item-card";
export type { ItemCardProps } from "./components/item-card";

export { NowCard } from "./components/now-card";
export type { NowCardAction, NowCardProps } from "./components/now-card";

export { ChangeCard } from "./components/change-card";
export type {
  ChangeCardAffectedItem,
  ChangeCardOption,
  ChangeCardProps,
} from "./components/change-card";

export { SourcesFooter } from "./components/sources-footer";
export type { SourceEntry, SourcesFooterProps } from "./components/sources-footer";

export { OpsDataTable } from "./components/ops-data-table";
export type { OpsDataTableProps } from "./components/ops-data-table";

/*
 * shadcn primitives, added with `pnpm ui:add <name>` (see packages/ui/components.json).
 *
 * These are the unopinionated building blocks. Everything above is the opinionated layer
 * that encodes PRD rules — a TierChip is not a Badge with a colour, it is the traveler's
 * own statement of what matters, and the option ladder reads it.
 *
 * Only what is actually used is kept here (CLAUDE.md §4: no speculative abstractions).
 * The registry is wired, so pulling another one in is a single command rather than a
 * reason to keep spares around.
 *
 * Deliberately NOT taken from the registry: `Select`. Radix's is a custom listbox, and on
 * the Android phones this product is built for a native `<select>` opens the OS picker —
 * bigger targets, familiar gestures, and accessible without any work from us. That is the
 * better control here even though it is the less fashionable one.
 */
export { Input } from "./components/input";
export { Label } from "./components/label";
export { Alert, AlertDescription, AlertTitle } from "./components/alert";
