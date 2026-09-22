import type { ExtractedBrief } from "@mandhira/providers";

/**
 * Scoring extraction quality (PRD-INT-006: ≥85% field accuracy per launch language).
 *
 * PURE. The scorer has to be trustworthy before the number it produces means anything, so
 * it is separated from everything that calls a model and tested on its own.
 *
 * What is scored, and what is not. A field the traveler's sentence DID say is scored on
 * whether the model got it; a field the sentence did not mention is scored on whether the
 * model left it alone. The second half matters more than it looks: a model that confidently
 * fills in "3 days" for every sentence would score well on a set where most journeys happen
 * to be three days, and would be useless. Inventing is as wrong as missing.
 *
 * `suggested` is compared too. PRD-INT-003 turns on it — a guess the traveler must confirm
 * is a different answer from a fact they stated, and a model that returns the right value
 * with the wrong confidence has not got the field right.
 */

export type ExpectedBrief = {
  /** The destination's NAME as the sentence gives it, or null when it names none. */
  destination?: string | null;
  destinationSuggested?: boolean;
  dayCount?: number | null;
  startDate?: string | null;
  pace?: "relaxed" | "balanced" | "full" | null;
  /** Traveler labels are not compared — mobility and age band are what the engine uses. */
  travelers?: { mobility: string; ageBand: string }[];
  /** Slugs of the experiences the sentence asks for, resolved against the vocabulary. */
  mustDo?: string[];
  wouldLike?: string[];
  /** Whether the sentence contains something we have no experience for (PRD-INT-005). */
  hasUnmatched?: boolean;
};

export type Scenario = {
  id: string;
  /** The same journey said in each launch language. */
  text: Record<string, string>;
  expected: ExpectedBrief;
  /** What this scenario is for, so a failing row is diagnosable rather than just red. */
  tests: string;
};

export type FieldResult = { field: string; correct: boolean; got: string; want: string };
export type ScenarioScore = { id: string; fields: FieldResult[]; accuracy: number };

const show = (value: unknown): string =>
  value === null || value === undefined ? "—" : JSON.stringify(value);

/**
 * Compares one extracted brief against what the sentence actually said.
 *
 * `vocabulary` maps an experience id to its slug, because a fixture cannot know the ids a
 * particular database generated — the sentence asks for "the morning darshan", and what is
 * being scored is whether the model picked THAT experience, not a uuid.
 */
export function scoreBrief(
  brief: ExtractedBrief,
  expected: ExpectedBrief,
  vocabulary: Map<string, string>,
): ScenarioScore["fields"] {
  const fields: FieldResult[] = [];

  const compare = (field: string, got: unknown, want: unknown) => {
    fields.push({
      field,
      correct: JSON.stringify(got ?? null) === JSON.stringify(want ?? null),
      got: show(got),
      want: show(want),
    });
  };

  if ("destination" in expected) {
    compare("destination", brief.destination?.text ?? null, expected.destination ?? null);
  }
  if (expected.destinationSuggested !== undefined) {
    compare(
      "destination.suggested",
      brief.destination?.suggested ?? false,
      expected.destinationSuggested,
    );
  }
  if ("dayCount" in expected) {
    compare("dayCount", brief.dayCount?.value ?? null, expected.dayCount ?? null);
  }
  if ("startDate" in expected) {
    compare("startDate", brief.startDate?.value ?? null, expected.startDate ?? null);
  }
  if ("pace" in expected) {
    compare("pace", brief.pace?.value ?? null, expected.pace ?? null);
  }

  if (expected.travelers) {
    /*
     * Order-insensitive: "my mother and I" and "I and my mother" are the same party.
     *
     * A traveler the model gave no mobility or age band for reads as the defaults the
     * engine would apply, so "said nothing" and "said adult, walks fine" score the same —
     * which is true of the plan that comes out.
     */
    const sort = (list: { mobility?: string | undefined; ageBand?: string | undefined }[]) =>
      [...list].map((t) => `${t.ageBand ?? "adult"}/${t.mobility ?? "full"}`).sort();
    compare("travelers", sort(brief.travelers), sort(expected.travelers));
  }

  const slugsOf = (picks: { experienceId: string }[]) =>
    [...new Set(picks.map((pick) => vocabulary.get(pick.experienceId)).filter(Boolean))].sort();

  if (expected.mustDo) compare("mustDo", slugsOf(brief.mustDo), [...expected.mustDo].sort());
  if (expected.wouldLike) {
    compare("wouldLike", slugsOf(brief.wouldLike), [...expected.wouldLike].sort());
  }
  if (expected.hasUnmatched !== undefined) {
    compare("unmatched", brief.unmatched.length > 0, expected.hasUnmatched);
  }

  return fields;
}

export function accuracyOf(fields: FieldResult[]): number {
  if (fields.length === 0) return 1;
  return fields.filter((field) => field.correct).length / fields.length;
}

/** What PRD-INT-006 requires of a launch language. */
export const ACCURACY_TARGET = 0.85;

export type LanguageReport = {
  locale: string;
  scenarios: ScenarioScore[];
  accuracy: number;
  meetsTarget: boolean;
  /** Every field the model got wrong, so a failure names what to fix. */
  misses: { scenario: string; field: string; got: string; want: string }[];
};

export function reportFor(locale: string, scenarios: ScenarioScore[]): LanguageReport {
  const fields = scenarios.flatMap((scenario) => scenario.fields);
  const accuracy = accuracyOf(fields);

  return {
    locale,
    scenarios,
    accuracy,
    meetsTarget: accuracy >= ACCURACY_TARGET,
    misses: scenarios.flatMap((scenario) =>
      scenario.fields
        .filter((field) => !field.correct)
        .map((field) => ({
          scenario: scenario.id,
          field: field.field,
          got: field.got,
          want: field.want,
        })),
    ),
  };
}
