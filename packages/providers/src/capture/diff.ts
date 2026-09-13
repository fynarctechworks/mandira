/**
 * Diffing two captures, and deciding what that means (PRD-OPS-SRC-002/004).
 *
 * Pure. No I/O, no clock — the same discipline as the journey engine (D-005), and for the
 * same reason: this decides whether an operator is interrupted, so it has to be testable
 * without a network or a calendar.
 */

export type DiffLine = { kind: "added" | "removed"; text: string };

export type CaptureDiff = {
  lines: DiffLine[];
  added: number;
  removed: number;
  /** True when the two captures are the same text. */
  identical: boolean;
};

/**
 * A line diff, longest-common-subsequence, capped.
 *
 * The cap is not an optimisation — LCS is O(n·m) and a pair of 20 000-line pages would
 * allocate 400 million cells inside a cron invocation with a time budget. Past the cap the
 * result degrades to a set difference, which loses the ORDER of changes but keeps every
 * added and removed line. Change detection reads the lines, not their order, so nothing
 * downstream is weakened; the operator's rendered diff is just less pleasant to read, and
 * `truncated` says so.
 */
const MAX_LCS_LINES = 4000;

export function diffCaptures(previous: string, next: string): CaptureDiff {
  if (previous === next) return { lines: [], added: 0, removed: 0, identical: true };

  const before = previous.length > 0 ? previous.split("\n") : [];
  const after = next.length > 0 ? next.split("\n") : [];

  const lines =
    before.length > MAX_LCS_LINES || after.length > MAX_LCS_LINES
      ? setDifference(before, after)
      : lcsDiff(before, after);

  return {
    lines,
    added: lines.filter((line) => line.kind === "added").length,
    removed: lines.filter((line) => line.kind === "removed").length,
    identical: lines.length === 0,
  };
}

/** Renders a diff the way `diff_from_previous` stores it: one prefixed line each. */
export function formatDiff(diff: CaptureDiff, maxLines = 400): string {
  const shown = diff.lines.slice(0, maxLines);
  const body = shown.map((line) => `${line.kind === "added" ? "+" : "-"} ${line.text}`).join("\n");

  return diff.lines.length > maxLines
    ? `${body}\n… ${diff.lines.length - maxLines} more changed lines`
    : body;
}

function lcsDiff(before: string[], after: string[]): DiffLine[] {
  const n = before.length;
  const m = after.length;

  // table[i][j] = length of the LCS of before[i..] and after[j..].
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i]![j] =
        before[i] === after[j]
          ? table[i + 1]![j + 1]! + 1
          : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;

  while (i < n && j < m) {
    if (before[i] === after[j]) {
      i++;
      j++;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      lines.push({ kind: "removed", text: before[i]! });
      i++;
    } else {
      lines.push({ kind: "added", text: after[j]! });
      j++;
    }
  }

  while (i < n) lines.push({ kind: "removed", text: before[i++]! });
  while (j < m) lines.push({ kind: "added", text: after[j++]! });

  return lines;
}

/** The degraded path past the cap: every line present in one side and not the other. */
function setDifference(before: string[], after: string[]): DiffLine[] {
  const inAfter = new Set(after);
  const inBefore = new Set(before);

  return [
    ...before
      .filter((line) => !inAfter.has(line))
      .map((text) => ({ kind: "removed" as const, text })),
    ...after
      .filter((line) => !inBefore.has(line))
      .map((text) => ({ kind: "added" as const, text })),
  ];
}
