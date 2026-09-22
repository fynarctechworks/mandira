import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TrustBadge } from "./trust-badge";
import { TrustSheet } from "./trust-sheet";

/**
 * PRD-TRST-005's honesty rules, as tests rather than as a paragraph.
 *
 * These are the rules a well-meaning change breaks most easily. "Show the confidence so
 * people can judge for themselves" and "hide the badge when we are not sure, it looks bad"
 * are both reasonable-sounding instincts, and both are forbidden — the first because a
 * percentage invites arithmetic on a judgement, the second because the traveler who most
 * needs to check locally is exactly the one who would stop being told.
 */
describe("no percentages anywhere in the trust UI", () => {
  const percentage = /\d+\s*%/;

  it("the sheet shows a source and a date, never a score", () => {
    const { container } = render(
      <TrustSheet
        open
        onOpenChange={() => {}}
        sourceName="Temple authority"
        sourceTierLabel="Official temple authority"
        lastConfirmed="12 September 2026"
        validUntil="12 December 2026"
        conflictNote="Two sources list different evening timings. We show the official one."
        changedNote="This was edited after it was last confirmed."
      />,
    );

    expect(container.textContent ?? "").not.toMatch(percentage);
    expect(screen.getByText("Official temple authority", { exact: false })).toBeTruthy();
  });

  it("a badge is a word, not a number", () => {
    for (const state of ["verified", "verified_earlier", "check_locally"] as const) {
      const { container, unmount } = render(<TrustBadge state={state} label={state} />);
      expect(container.textContent ?? "").not.toMatch(percentage);
      unmount();
    }
  });
});

describe("a low-confidence badge is never hidden", () => {
  it("renders 'check locally' as visibly as the others", () => {
    const { container } = render(<TrustBadge state="check_locally" label="Check locally" />);

    const badge = container.firstElementChild as HTMLElement | null;
    expect(badge, "check_locally rendered nothing at all").not.toBeNull();
    expect(screen.getByText("Check locally")).toBeTruthy();

    // Not hidden from sight, and not hidden from a screen reader either.
    expect(badge?.hasAttribute("hidden")).toBe(false);
    expect(badge?.getAttribute("aria-hidden")).not.toBe("true");
    expect(badge?.className ?? "").not.toMatch(/\bhidden\b|\bsr-only\b|\bopacity-0\b/);
  });
});
