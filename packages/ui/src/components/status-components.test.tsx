import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HEALTH_CONFIG, HealthPill, type HealthState } from "./health-pill";
import { OfflineBanner } from "./offline-banner";
import { TIER_CONFIG, TierChip, type PriorityTier } from "./tier-chip";
import { TRUST_CONFIG, TrustBadge, type TrustState } from "./trust-badge";

const TIERS = Object.keys(TIER_CONFIG) as PriorityTier[];
const TRUST_STATES = Object.keys(TRUST_CONFIG) as TrustState[];
const HEALTH_STATES = Object.keys(HEALTH_CONFIG) as HealthState[];

/**
 * PRD 12.8: every status is conveyed by icon AND text, never colour alone. These tests assert
 * both halves are present for every state, so a future "tidy up" cannot silently drop one.
 */
describe("status is always icon + text", () => {
  it.each(TIERS)("TierChip %s renders an icon and its word", (tier) => {
    const { container } = render(<TierChip tier={tier} />);
    expect(screen.getByText(tier)).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it.each(TRUST_STATES)("TrustBadge %s renders an icon and its word", (state) => {
    const { container } = render(<TrustBadge state={state} />);
    expect(screen.getByText(TRUST_CONFIG[state].defaultLabel)).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it.each(HEALTH_STATES)("HealthPill %s renders an icon and its word", (state) => {
    const { container } = render(<HealthPill state={state} />);
    expect(screen.getByText(HEALTH_CONFIG[state].defaultLabel)).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("OfflineBanner announces itself and pairs icon with text", () => {
    const { container } = render(<OfflineBanner message="You're offline — showing saved plans." />);
    const status = screen.getByRole("status");
    expect(within(status).getByText(/You're offline/)).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});

describe("labels stay externalised", () => {
  it("TierChip accepts a localised label instead of the tier keyword", () => {
    render(<TierChip tier="PROTECTED" label="రక్షితం" />);
    expect(screen.getByText("రక్షితం")).toBeInTheDocument();
    expect(screen.queryByText("PROTECTED")).not.toBeInTheDocument();
  });

  it("TrustBadge accepts a localised word", () => {
    render(<TrustBadge state="check_locally" label="स्थानीय रूप से जाँचें" />);
    expect(screen.getByText("स्थानीय रूप से जाँचें")).toBeInTheDocument();
  });
});

describe("interaction affordances", () => {
  it("TierChip is a button by default so it can open the tier picker", () => {
    render(<TierChip tier="IMPORTANT" />);
    expect(screen.getByRole("button", { name: /IMPORTANT/ })).toBeInTheDocument();
  });

  it("TierChip renders inert markup when readOnly", () => {
    render(<TierChip tier="FIXED" readOnly />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("FIXED")).toBeInTheDocument();
  });
});
