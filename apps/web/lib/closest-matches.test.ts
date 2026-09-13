import { describe, expect, it } from "vitest";

import { closestMatches, similarity } from "./closest-matches";

const published = [
  { id: "e1", name: "Suprabhatam Seva" },
  { id: "e2", name: "Evening Aarti (fixture)" },
  { id: "e3", name: "General Darshan" },
  { id: "e4", name: "Kalyanotsavam" },
  { id: "e5", name: "సుప్రభాత సేవ" },
];

describe("closestMatches", () => {
  it("finds a published experience through transliteration drift", () => {
    expect(closestMatches("suprabhatham", published).map((m) => m.id)).toContain("e1");
  });

  it("matches one word of a longer name, ignoring bracketed notes", () => {
    expect(closestMatches("aarti", published)[0]?.id).toBe("e2");
  });

  it("works in Telugu script as well", () => {
    expect(closestMatches("సుప్రభాతం", published)[0]?.id).toBe("e5");
  });

  it("offers nothing rather than a far-fetched match", () => {
    expect(closestMatches("a boat ride", published)).toEqual([]);
    expect(closestMatches("  ", published)).toEqual([]);
  });

  it("never suggests what is already in the brief, and caps the list", () => {
    const many = Array.from({ length: 6 }, (_, n) => ({ id: `d${n}`, name: `Darshan ${n}` }));

    expect(
      closestMatches("darshan", many, { exclude: new Set(["d0"]) }).map((m) => m.id),
    ).not.toContain("d0");
    expect(closestMatches("darshan", many)).toHaveLength(3);
  });

  it("only ever returns entries from the list it was given", () => {
    for (const match of closestMatches("seva darshan aarti", published, { limit: 10 })) {
      expect(published).toContain(match);
    }
  });
});

describe("similarity", () => {
  it("is 1 for the same name and 0 for nothing in common", () => {
    expect(similarity("Kalyanotsavam", "kalyanotsavam")).toBe(1);
    expect(similarity("abc", "xyz")).toBe(0);
  });
});
