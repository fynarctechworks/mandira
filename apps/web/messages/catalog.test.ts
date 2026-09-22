import { describe, expect, it } from "vitest";
import { catalogProblems, flattenCatalog } from "@mandhira/i18n";

import en from "./en.json";
import hi from "./hi.json";
import te from "./te.json";

/**
 * The traveler app's three catalogues, held to each other (PRD-LANG-001).
 *
 * What this can prove is that every screen has a string to show and that every string
 * renders: same keys, same placeholders, plurals intact, no unclosed brace. What it
 * cannot prove is that a Telugu sentence sounds like something a pilgrim would say —
 * `pnpm i18n:review` builds the pack a native speaker reads for that, and no test here
 * stands in for one.
 *
 * It fails the build rather than warning, because each of these is a visible defect in a
 * language the person who caused it probably cannot read. A missing key shows English
 * mid-sentence; a lost placeholder shows a sentence with a hole; an unclosed brace throws.
 */
const catalogues = [
  ["Hindi", hi],
  ["Telugu", te],
] as const;

describe("the traveler catalogues", () => {
  it.each(catalogues)("%s says everything English says, and renders", (_name, catalogue) => {
    const problems = catalogProblems(en, catalogue);

    // Named one per line: a translator fixing these wants the list, not a count.
    expect(problems.map((p) => `${p.key}: ${p.problem}`)).toEqual([]);
  });

  it("offers the same language everywhere, so no screen is half-built", () => {
    const sizes = [en, hi, te].map((c) => Object.keys(flattenCatalog(c)).length);
    expect(new Set(sizes).size).toBe(1);
  });

  it("has no message that is only whitespace", () => {
    for (const [name, catalogue] of [["English", en], ...catalogues] as const) {
      const blank = Object.entries(flattenCatalog(catalogue))
        .filter(([, value]) => value.trim() === "")
        .map(([key]) => `${name} ${key}`);
      expect(blank).toEqual([]);
    }
  });
});
