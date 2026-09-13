/**
 * The translation workspace's grid (O17): `ui_strings` rows pivoted to one row per key with
 * a cell per active locale. Pure, so the counts an operator plans a week around are tested.
 */

export type UiStringRow = { key: string; locale: string; value: string; status: string };
export type Cell = { value: string; status: string } | null;
export type PivotRow = { key: string; cells: Record<string, Cell> };

export const TRANSLATION_PAGE_SIZE = 100;

export function pivotStrings(rows: readonly UiStringRow[], locales: readonly string[]): PivotRow[] {
  const byKey = new Map<string, PivotRow>();
  for (const row of rows) {
    let entry = byKey.get(row.key);
    if (!entry) {
      entry = { key: row.key, cells: Object.fromEntries(locales.map((code) => [code, null])) };
      byKey.set(row.key, entry);
    }
    if (locales.includes(row.locale))
      entry.cells[row.locale] = { value: row.value, status: row.status };
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export type StringFilter = { q: string; missing: string | null };

/** `missing` means no confirmed value in that locale — a draft still needs a translator. */
export function filterPivot(rows: readonly PivotRow[], filter: StringFilter): PivotRow[] {
  const q = filter.q.trim().toLowerCase();
  return rows.filter((row) => {
    if (q && !row.key.toLowerCase().includes(q)) {
      const inValues = Object.values(row.cells).some((cell) =>
        cell?.value.toLowerCase().includes(q),
      );
      if (!inValues) return false;
    }
    if (filter.missing) return row.cells[filter.missing]?.status !== "confirmed";
    return true;
  });
}

export type LocaleProgress = { code: string; confirmed: number; drafts: number; missing: number };

export function localeProgress(
  rows: readonly PivotRow[],
  locales: readonly string[],
): LocaleProgress[] {
  return locales.map((code) => {
    let confirmed = 0;
    let drafts = 0;
    for (const row of rows) {
      const cell = row.cells[code];
      if (cell?.status === "confirmed") confirmed++;
      else if (cell) drafts++;
    }
    return { code, confirmed, drafts, missing: rows.length - confirmed - drafts };
  });
}
