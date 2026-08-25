import { describe, expect, it } from "vitest";
import { candidateBlock, journeyBriefSchema } from "./brief-schema";
import type { CandidateExperience } from "./types";

const candidates: CandidateExperience[] = [
  { id: "exp-suprabhatam", name: "Suprabhatam seva", type: "seva" },
  { id: "exp-darshan", name: "General darshan", type: "darshan" },
];

const minimal = {
  travelers: [],
  mustDo: [],
  wouldLike: [],
  fixedCommitments: [],
  unmatched: [],
  unclear: [],
};

describe("journeyBriefSchema", () => {
  it("accepts an experience id from the candidate list", () => {
    const parsed = journeyBriefSchema(candidates).safeParse({
      ...minimal,
      mustDo: [{ experienceId: "exp-suprabhatam", suggested: false }],
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects an id that is not in the candidate list", () => {
    // The first of two layers: the schema constrains the provider, and `keepKnownIds`
    // checks the constraint held (PRD-INT-005 requires 100% blocked).
    const parsed = journeyBriefSchema(candidates).safeParse({
      ...minimal,
      mustDo: [{ experienceId: "exp-invented", suggested: false }],
    });

    expect(parsed.success).toBe(false);
  });

  it("stays unsatisfiable when there is no published knowledge to choose from", () => {
    // Allowing a free string here would turn the one hard constraint off exactly when
    // there is nothing to check against.
    const parsed = journeyBriefSchema([]).safeParse({
      ...minimal,
      mustDo: [{ experienceId: "anything", suggested: false }],
    });

    expect(parsed.success).toBe(false);
  });

  it("still accepts a brief with nothing in mustDo when there are no candidates", () => {
    expect(journeyBriefSchema([]).safeParse(minimal).success).toBe(true);
  });

  it("requires every inferred value to be labelled", () => {
    const withoutLabel = journeyBriefSchema(candidates).safeParse({
      ...minimal,
      pace: { value: "relaxed" },
    });

    expect(withoutLabel.success).toBe(false);
  });

  it("caps a group at the 12 travelers PRD-PLAN-010 allows", () => {
    const thirteen = Array.from({ length: 13 }, (_, i) => ({
      label: `t${i}`,
      suggested: false,
    }));

    expect(
      journeyBriefSchema(candidates).safeParse({ ...minimal, travelers: thirteen }).success,
    ).toBe(false);
  });

  it("keeps unmatched mentions as the traveler's own words", () => {
    const parsed = journeyBriefSchema(candidates).safeParse({
      ...minimal,
      unmatched: ["the small shrine behind the temple"],
    });

    expect(parsed.success).toBe(true);
  });
});

describe("candidateBlock", () => {
  it("gives the model ids, types and names and nothing else", () => {
    const block = candidateBlock(candidates);

    expect(block).toBe(
      "exp-suprabhatam\tseva\tSuprabhatam seva\nexp-darshan\tdarshan\tGeneral darshan",
    );
  });

  it("is empty when there is nothing published", () => {
    expect(candidateBlock([])).toBe("");
  });
});
