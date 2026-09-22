import { describe, expect, it } from "vitest";

import { catalogProblems, flattenCatalog, messageArguments, untranslatedKeys } from "./catalog";

describe("messageArguments", () => {
  it("reads a bare placeholder", () => {
    expect(messageArguments("Leave by {time}")).toEqual([
      { name: "time", type: "", selectors: [] },
    ]);
  });

  it("reads a plural and its branches, not the words inside them", () => {
    const [arg] = messageArguments(
      "{count, plural, one {One change saved} other {# changes saved}}",
    );
    expect(arg).toEqual({ name: "count", type: "plural", selectors: ["one", "other"] });
  });

  it("finds a placeholder nested inside a branch", () => {
    const args = messageArguments("{count, plural, one {at {place}} other {at {place}, # times}}");
    // Once per branch, so the caller compares sets rather than counts.
    expect([...new Set(args.map((a) => a.name))].sort()).toEqual(["count", "place"]);
  });

  it("keeps an exact-number branch, which is a sentence about one number", () => {
    const [arg] = messageArguments("{minutes, plural, =0 {No spare time} other {# minutes}}");
    expect(arg?.selectors).toEqual(["=0", "other"]);
  });

  it("does not mistake a formatting style for a nested message", () => {
    expect(messageArguments("{when, date, long}")).toEqual([
      { name: "when", type: "date", selectors: [] },
    ]);
  });

  it("ignores braces a translator escaped on purpose", () => {
    expect(messageArguments("Type '{name}' to confirm")).toEqual([]);
  });

  it("refuses a message it cannot parse, because so will the phone rendering it", () => {
    expect(() => messageArguments("{count, plural, one {One} other {#}")).toThrow();
    expect(() => messageArguments("Leave by {time")).toThrow();
    expect(() => messageArguments("Leave by }")).toThrow();
  });
});

describe("flattenCatalog", () => {
  it("addresses nested keys the way next-intl does", () => {
    expect(flattenCatalog({ live: { now: "Now", next: { label: "Next" } } })).toEqual({
      "live.now": "Now",
      "live.next.label": "Next",
    });
  });
});

describe("catalogProblems", () => {
  const en = {
    live: {
      now: "Now",
      queued: "{count, plural, one {One change waiting} other {# changes waiting}}",
      leaveBy: "Leave by {time} to reach {place}",
      spare: "{minutes, plural, =0 {No spare time} other {about # minutes}}",
    },
  };

  it("passes a translation that keeps the shape", () => {
    expect(
      catalogProblems(en, {
        live: {
          now: "अभी",
          queued: "{count, plural, one {एक बदलाव बाकी} other {# बदलाव बाकी}}",
          leaveBy: "{place} पहुँचने के लिए {time} तक निकलें",
          spare: "{minutes, plural, =0 {खाली समय नहीं} other {लगभग # मिनट}}",
        },
      }),
    ).toEqual([]);
  });

  it("catches a missing key rather than letting the screen fall back silently", () => {
    const withoutNow = Object.fromEntries(Object.entries(en.live).filter(([key]) => key !== "now"));
    const problems = catalogProblems(en, { live: withoutNow });
    expect(problems).toContainEqual({
      key: "live.now",
      problem: "missing — the screen would fall back to English",
    });
  });

  it("catches a blank string, which shows nothing at all", () => {
    const problems = catalogProblems(en, { live: { ...en.live, now: "   " } });
    expect(problems[0]?.problem).toContain("blank");
  });

  it("catches a renamed placeholder in both directions", () => {
    const problems = catalogProblems(en, {
      live: { ...en.live, leaveBy: "{स्थान} के लिए {time} तक निकलें" },
    });
    expect(problems.map((p) => p.problem)).toEqual([
      "uses {स्थान}, which nothing passes in",
      "never uses {place}, so that value is lost",
    ]);
  });

  it("catches a plural flattened to one form — the bug nobody sees until the count is two", () => {
    const problems = catalogProblems(en, { live: { ...en.live, queued: "{count} बदलाव बाकी" } });
    expect(problems).toEqual([
      {
        key: "live.queued",
        problem: "{count} lost its plural forms, so one and many read the same",
      },
    ]);
  });

  it("catches a dropped =0 branch, because zero would then read as a number", () => {
    const problems = catalogProblems(en, {
      live: { ...en.live, spare: "{minutes, plural, other {लगभग # मिनट}}" },
    });
    expect(problems).toEqual([
      {
        key: "live.spare",
        problem: '{minutes} has no "=0" branch, so that case falls into "other"',
      },
    ]);
  });

  it("catches a missing other branch, which ICU requires", () => {
    const problems = catalogProblems(en, {
      live: { ...en.live, queued: "{count, plural, one {एक बदलाव बाकी}}" },
    });
    expect(problems[0]?.problem).toContain('no "other" branch');
  });

  it("reports an unparseable translation as the runtime throw it is", () => {
    const problems = catalogProblems(en, { live: { ...en.live, now: "अभी {" } });
    expect(problems[0]?.problem).toContain("does not parse");
  });

  it("names a key the translation invented", () => {
    const problems = catalogProblems(en, { live: { ...en.live, extra: "कुछ" } });
    expect(problems).toContainEqual({
      key: "live.extra",
      problem: "not in the English catalogue, so nothing ever reads it",
    });
  });
});

describe("untranslatedKeys", () => {
  it("lists what is identical to English, for a person to judge", () => {
    const en = { conditions: { temperature: "{degrees}°C", wind: "Windy" } };
    const hi = { conditions: { temperature: "{degrees}°C", wind: "हवा तेज़" } };

    // "{degrees}°C" is right as it stands; "Windy" would not have been. Only a reader of
    // the language can tell those apart, so this returns a list and judges nothing.
    expect(untranslatedKeys(en, hi)).toEqual(["conditions.temperature"]);
  });
});
