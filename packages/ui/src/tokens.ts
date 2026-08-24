/**
 * Token names as data (PRD 12.1) - used by the contract test and, later, by
 * components that enumerate status/tier variants. Values live in tokens.css.
 */
export const colorTokens = [
  "brand-primary",
  "brand-primary-pressed",
  "brand-primary-soft",
  "brand-ink",
  "bg-canvas",
  "bg-surface",
  "bg-surface-raised",
  "border-subtle",
  "text-primary",
  "text-secondary",
  "text-tertiary",
  "text-on-primary",
  "status-comfortable",
  "status-tight",
  "status-at-risk",
  "status-broken",
  "status-info",
  "tier-fixed-fill",
  "tier-fixed-text",
  "tier-protected-fill",
  "tier-protected-text",
  "tier-important-fill",
  "tier-important-text",
  "tier-optional-fill",
  "tier-optional-text",
] as const;

export type ColorToken = (typeof colorTokens)[number];

/** Tokens whose value differs between light and dark (PRD 12.1 tables). */
export const darkOverriddenTokens: readonly ColorToken[] = colorTokens.filter(
  (t) => t !== "tier-fixed-text" && t !== "tier-optional-text",
);
