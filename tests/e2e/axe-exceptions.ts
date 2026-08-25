import type AxeBuilder from "@axe-core/playwright";

/**
 * Known, escalated exceptions (OPEN-008, raised 2026-08-24, awaiting founder decision).
 *
 * PRD §12.1 declares its palette normative ("Exact palette") AND claims every pair meets
 * ≥4.5:1, which PRD §12.8 / PRD-DSGN-001 require. Measured in the browser, five light-mode
 * pairings miss that bar. The implementation uses the PRD values verbatim rather than silently
 * substituting compliant colours, so the gap stays visible until the founder rules on it.
 *
 * Matching is on the exact foreground/background pair axe measured, not on component markup —
 * so a genuinely new contrast regression fails even if it renders the same words.
 *
 * | Where | fg | bg | measured |
 * |---|---|---|---|
 * | PROTECTED tier chip      | #ffffff | #ff660e (brand.primary)      | 2.93:1 |
 * | Tight health pill        | #b8860b | #f6f0e2 (status.tight @12%)  | 2.86:1 |
 * | At risk health pill      | #d9702b | #faeee6 (status.at_risk @12%)| 2.92:1 |
 * | Comfortable health pill  | #2e7d4f | #e6efea (12% on bg.surface)  | 4.30:1 |
 * | Comfortable health pill  | #2e7d4f | #e2e8de (12% on bg.canvas)   | 4.04:1 |
 * | "Verified earlier" badge | #b8860b | #ffffff (bg.surface)         | 3.25:1 |
 *
 * Note the Comfortable pill passes on plain white (5.2:1) and fails only because PRD §12.5
 * specifies a 12% status-colour fill behind it — a recipe interaction, not a bad token. It is
 * listed twice because the composite differs over bg.surface (Ops) and bg.canvas (traveler).
 *
 * Remove entries as OPEN-008 is resolved (new light-mode hex values, or a documented exception).
 */
const KNOWN_CONTRAST_EXCEPTIONS: ReadonlyArray<{ fg: string; bg: string }> = [
  { fg: "#ffffff", bg: "#ff660e" },
  { fg: "#b8860b", bg: "#f6f0e2" },
  { fg: "#d9702b", bg: "#faeee6" },
  { fg: "#2e7d4f", bg: "#e6efea" },
  { fg: "#2e7d4f", bg: "#e2e8de" },
  { fg: "#b8860b", bg: "#ffffff" },
];

type AxeResults = Awaited<ReturnType<AxeBuilder["analyze"]>>;
type CheckData = { fgColor?: string; bgColor?: string; contrastRatio?: number };

function isKnownContrastException(data: unknown): boolean {
  const { fgColor, bgColor } = (data ?? {}) as CheckData;
  if (!fgColor || !bgColor) return false;
  return KNOWN_CONTRAST_EXCEPTIONS.some(
    (e) => e.fg === fgColor.toLowerCase() && e.bg === bgColor.toLowerCase(),
  );
}

/**
 * Flattens axe violations to serious/critical offenders, dropping only the escalated OPEN-008
 * colour pairs. Returns one readable string per offending node.
 */
export function seriousViolations(results: AxeResults): string[] {
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .flatMap((v) =>
      v.nodes
        .filter((n) => {
          if (v.id !== "color-contrast") return true;
          // Keep the node unless every failing check on it is a known exception.
          const checks = n.any.length > 0 ? n.any : [];
          return !(checks.length > 0 && checks.every((c) => isKnownContrastException(c.data)));
        })
        .map((n) => `${v.id}: ${n.html}`),
    );
}
