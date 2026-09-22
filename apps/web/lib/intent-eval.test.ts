import {
  isAiConfigured,
  type AiProvider,
  type AiResult,
  type ExtractedBrief,
} from "@mandhira/providers";
import { describe, expect, it, vi } from "vitest";

import { accuracyOf, ACCURACY_TARGET, reportFor, scoreBrief } from "./intent-eval";
import type { ExperienceCard } from "./knowledge";
import { SCENARIOS, VOCABULARY } from "./intent-scenarios";

vi.mock("./knowledge", () => ({ getDestinationCards: vi.fn(), getDestinationPage: vi.fn() }));
vi.mock("@mandhira/db/client/server", () => ({ createServiceRoleSupabase: vi.fn() }));

const { extractJourneyBrief } = await import("./intent");

const EMPTY: ExtractedBrief = {
  travelers: [],
  mustDo: [],
  wouldLike: [],
  fixedCommitments: [],
  unmatched: [],
  unclear: [],
};

const vocabulary = new Map([
  ["id-morning", "morning-darshan"],
  ["id-aarti", "evening-aarti"],
]);

describe("scoreBrief", () => {
  it("scores a field the sentence stated and the model read correctly", () => {
    const fields = scoreBrief({ ...EMPTY, dayCount: { value: 3 } }, { dayCount: 3 }, vocabulary);
    expect(fields).toEqual([{ field: "dayCount", correct: true, got: "3", want: "3" }]);
  });

  it("counts inventing a value as wrong, not as a near miss", () => {
    // A model that fills in "3 days" for every sentence would otherwise look accurate on a
    // set where most journeys happen to be three days, and be useless.
    const fields = scoreBrief({ ...EMPTY, dayCount: { value: 3 } }, { dayCount: null }, vocabulary);
    expect(fields[0]?.correct).toBe(false);
    expect(fields[0]).toMatchObject({ got: "3", want: "—" });
  });

  it("counts missing a value the sentence gave as wrong too", () => {
    const fields = scoreBrief(EMPTY, { dayCount: 3 }, vocabulary);
    expect(fields[0]?.correct).toBe(false);
  });

  it("treats the right value with the wrong confidence as wrong", () => {
    // PRD-INT-003: a guess the traveler must confirm is a different answer from a fact.
    const fields = scoreBrief(
      { ...EMPTY, destination: { text: "Tirumala", suggested: true } },
      { destination: "Tirumala", destinationSuggested: false },
      vocabulary,
    );
    expect(fields.find((f) => f.field === "destination")?.correct).toBe(true);
    expect(fields.find((f) => f.field === "destination.suggested")?.correct).toBe(false);
  });

  it("does not care what order a party was listed in", () => {
    const fields = scoreBrief(
      {
        ...EMPTY,
        travelers: [
          { label: "Amma", mobility: "limited_walking", ageBand: "senior" },
          { label: "Me", mobility: "full", ageBand: "adult" },
        ],
      },
      {
        travelers: [
          { mobility: "full", ageBand: "adult" },
          { mobility: "limited_walking", ageBand: "senior" },
        ],
      },
      vocabulary,
    );
    expect(fields[0]?.correct).toBe(true);
  });

  it("scores experiences by what they are, not by the ids a database happened to mint", () => {
    const fields = scoreBrief(
      { ...EMPTY, mustDo: [{ experienceId: "id-morning" }] },
      { mustDo: ["morning-darshan"] },
      vocabulary,
    );
    expect(fields[0]?.correct).toBe(true);
  });

  it("only scores the fields a scenario actually claims", () => {
    expect(scoreBrief(EMPTY, {}, vocabulary)).toEqual([]);
  });
});

describe("reportFor", () => {
  it("passes a language at the target and names every miss", () => {
    const report = reportFor("te", [
      {
        id: "s1",
        fields: [
          { field: "dayCount", correct: true, got: "3", want: "3" },
          { field: "pace", correct: false, got: '"full"', want: "—" },
        ],
        accuracy: 0.5,
      },
    ]);

    expect(report.accuracy).toBe(0.5);
    expect(report.meetsTarget).toBe(false);
    expect(report.misses).toEqual([{ scenario: "s1", field: "pace", got: '"full"', want: "—" }]);
  });

  it("holds every launch language to PRD-INT-006's number", () => {
    expect(ACCURACY_TARGET).toBe(0.85);
    expect(accuracyOf([{ field: "f", correct: true, got: "", want: "" }])).toBe(1);
  });
});

describe("the test set", () => {
  it("says every journey in all three launch languages", () => {
    for (const scenario of SCENARIOS) {
      for (const locale of ["en", "hi", "te"]) {
        expect(scenario.text[locale], `${scenario.id} has no ${locale}`).toBeTruthy();
      }
    }
  });

  it("exercises every field the brief carries, so the number is not about one of them", () => {
    const claimed = new Set(SCENARIOS.flatMap((s) => Object.keys(s.expected)));
    for (const field of ["dayCount", "pace", "travelers", "mustDo", "wouldLike", "hasUnmatched"]) {
      expect(claimed.has(field), `nothing tests ${field}`).toBe(true);
    }
  });

  it("includes journeys that state nothing about a field, not only ones that do", () => {
    // Half of extraction quality is leaving alone what was never said.
    expect(SCENARIOS.some((s) => s.expected.dayCount === null)).toBe(true);
    expect(SCENARIOS.some((s) => s.expected.pace === null)).toBe(true);
  });
});

/**
 * PRD-INT-006's other half: "100% hallucination block".
 *
 * Not a percentage measured over samples — a property. The brief is filtered against the
 * vocabulary that was sent to the model, so an experience it invents cannot reach the
 * traveler whatever it returns. These tests hand the extractor the worst reply a model
 * could produce and assert nothing invented survives.
 */
describe("the hallucination block", () => {
  const experience = (id: string, destinationId: string): ExperienceCard => ({
    id,
    slug: id,
    destinationId,
    name: { text: `Experience ${id}`, isFallback: false },
    experienceType: "darshan",
    significance: { text: "", isFallback: false },
    durationLikelyMinutes: 60,
    advanceBookingRequired: false,
    advanceBookingOpensDaysBefore: null,
    editorialWeight: 3,
    accessibility: null,
    trust: {},
    availability: [],
  });

  const providerReturning = (brief: ExtractedBrief) => {
    const result = async (): Promise<AiResult<ExtractedBrief>> => ({
      value: brief,
      cached: false,
      meta: {
        task: "intent_extract",
        provider: "google",
        model: "test",
        latencyMs: 1,
        groundingHash: "g",
        ok: true,
        isFallback: false,
      },
    });
    return { name: "google", extractIntent: vi.fn(result) } as unknown as AiProvider;
  };

  const loadCandidates = vi.fn(async () => ({
    destinations: [{ id: "d1", slug: "fixture", name: "Fixture town" }],
    experiences: [experience("e1", "d1")],
  }));

  it("drops an experience the model invented", async () => {
    const result = await extractJourneyBrief(
      { text: "the ghost darshan", locale: "en" },
      {
        provider: providerReturning({
          ...EMPTY,
          mustDo: [{ experienceId: "e1" }, { experienceId: "invented-id" }],
          wouldLike: [{ experienceId: "another-invention" }],
        }),
        loadCandidates,
        today: "2026-09-23",
      },
    );

    expect(result.status).toBe("extracted");
    if (result.status !== "extracted") return;
    expect(result.experiences.map((e) => e.id)).toEqual(["e1"]);
  });

  it("drops EVERY experience when the model invented them all", async () => {
    const result = await extractJourneyBrief(
      { text: "anything", locale: "en" },
      {
        provider: providerReturning({
          ...EMPTY,
          mustDo: [{ experienceId: "x" }, { experienceId: "y" }, { experienceId: "z" }],
        }),
        loadCandidates,
        today: "2026-09-23",
      },
    );

    if (result.status !== "extracted") throw new Error("expected an extraction");
    expect(result.experiences).toEqual([]);
  });

  it("resolves no destination from an invented one", async () => {
    const result = await extractJourneyBrief(
      { text: "anything", locale: "en" },
      {
        provider: providerReturning({
          ...EMPTY,
          destination: { id: "not-a-destination", text: "Atlantis" },
        }),
        loadCandidates,
        today: "2026-09-23",
      },
    );

    if (result.status !== "extracted") throw new Error("expected an extraction");
    // The only destination in the vocabulary is the fixture one; "Atlantis" resolves to it
    // or to nothing, but never to a destination the app does not have.
    expect(
      result.destination === null || result.destination.id === "d1",
      `resolved ${JSON.stringify(result.destination)}`,
    ).toBe(true);
  });
});

/**
 * PRD-INT-006's number, against the real model.
 *
 * Skipped when no key is configured, which is every developer machine and this repository's
 * current state — so **the accuracy figure has not been measured yet, and nothing here
 * pretends otherwise.** With `GOOGLE_GENERATIVE_AI_API_KEY` set (CI with secrets, or a
 * founder running it locally) the same suite produces the number and fails the build if a
 * launch language is below 85%.
 *
 * A test rather than a script: it needs the app's module resolution, it belongs in the
 * suite that gates a release, and a number nobody runs is not a gate.
 */
describe.skipIf(!isAiConfigured())("extraction quality against the live model", () => {
  const candidates = {
    destinations: [{ id: "d1", slug: "fixture", name: "Fixture temple town" }],
    experiences: VOCABULARY.map((slug) => ({
      id: `id-${slug}`,
      slug,
      destinationId: "d1",
      name: { text: slug.replace(/-/g, " "), isFallback: false },
      experienceType: "darshan",
      significance: { text: "", isFallback: false },
      durationLikelyMinutes: 60,
      advanceBookingRequired: false,
      advanceBookingOpensDaysBefore: null,
      editorialWeight: 3,
      accessibility: null,
      trust: {},
      availability: [],
    })) as ExperienceCard[],
  };
  const vocab = new Map(candidates.experiences.map((e) => [e.id, e.slug]));

  it.each(["en", "hi", "te"])(
    "reaches 85%% field accuracy in %s",
    async (locale) => {
      const scores = [];
      for (const scenario of SCENARIOS) {
        const result = await extractJourneyBrief(
          { text: scenario.text[locale]!, locale },
          { loadCandidates: async () => candidates, today: "2026-09-23" },
        );
        if (result.status !== "extracted") throw new Error(`${scenario.id}: ${result.status}`);

        const fields = scoreBrief(result.brief, scenario.expected, vocab);
        scores.push({ id: scenario.id, fields, accuracy: accuracyOf(fields) });
      }

      const report = reportFor(locale, scores);
      // The misses are in the message, so a failure says what to fix rather than just a ratio.
      expect(report.misses, `${locale} scored ${Math.round(report.accuracy * 100)}%`).toEqual(
        expect.arrayContaining([]),
      );
      expect(report.accuracy).toBeGreaterThanOrEqual(ACCURACY_TARGET);
    },
    120_000,
  );
});
