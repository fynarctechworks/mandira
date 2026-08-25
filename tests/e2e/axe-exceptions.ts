import type AxeBuilder from "@axe-core/playwright";

type AxeResults = Awaited<ReturnType<AxeBuilder["analyze"]>>;

/**
 * Flattens axe violations to serious/critical offenders, one readable string per node.
 *
 * There are deliberately NO exceptions. OPEN-008 was resolved on 2026-08-25 (D-025): the
 * light-mode palette now meets AA on every PRD §12.1 pair, so any contrast failure here is a
 * real regression. Do not reintroduce an allow-list without a DECISION_LOG entry.
 */
export function seriousViolations(results: AxeResults): string[] {
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.html}`));
}
