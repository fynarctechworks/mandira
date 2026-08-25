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
