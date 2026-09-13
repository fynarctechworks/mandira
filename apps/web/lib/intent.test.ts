import {
  AiUnavailableError,
  type AiProvider,
  type AiResult,
  type ExtractedBrief,
} from "@mandhira/providers";
import { describe, expect, it, vi } from "vitest";

import type { ExperienceCard } from "./knowledge";

vi.mock("./knowledge", () => ({ getDestinationCards: vi.fn(), getDestinationPage: vi.fn() }));
vi.mock("@mandhira/db/client/server", () => ({ createServiceRoleSupabase: vi.fn() }));

const { extractJourneyBrief } = await import("./intent");

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

const destinations = [
  { id: "d1", slug: "tirumala", name: "Tirumala" },
  { id: "d2", slug: "srisailam", name: "Srisailam" },
];

const brief: ExtractedBrief = {
  destination: { text: "Tirumala", suggested: false },
  dayCount: { value: 3, suggested: false },
  travelers: [{ label: "Amma", mobility: "limited_walking", ageBand: "senior", suggested: true }],
  mustDo: [{ experienceId: "e1", suggested: false }],
  wouldLike: [],
  fixedCommitments: [],
  pace: { value: "relaxed", suggested: true },
  unmatched: ["a boat ride"],
  unclear: [{ question: "Suprabhatam seva, or general early darshan?" }],
};

function providerReturning(result: () => Promise<AiResult<ExtractedBrief>>) {
  const extractIntent = vi.fn(result);
  const provider = {
    name: "google",
    extractIntent,
    extractKnowledge: vi.fn(),
    suggestTranslation: vi.fn(),
  } as unknown as AiProvider;
  return { provider, extractIntent };
}

const ok = async (): Promise<AiResult<ExtractedBrief>> => ({
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

describe("extractJourneyBrief", () => {
  it("answers unavailable when no model is configured, without loading anything", async () => {
    const loadCandidates = vi.fn();

    await expect(
      extractJourneyBrief(
        { text: "3 days in Tirumala", locale: "en" },
        { env: {} as NodeJS.ProcessEnv, loadCandidates },
      ),
    ).resolves.toEqual({ status: "unavailable", reason: "not_configured" });
    expect(loadCandidates).not.toHaveBeenCalled();
  });

  it("returns the brief with its inferences labelled and its destination resolved", async () => {
    const { provider, extractIntent } = providerReturning(ok);
    const loadCandidates = vi.fn(async () => ({
      destinations,
      experiences: [experience("e1", "d1"), experience("e2", "d2")],
    }));

    const result = await extractJourneyBrief(
      { text: "3 days in Tirumala with Amma", locale: "en" },
      { provider, loadCandidates, today: "2026-09-13" },
    );

    expect(result).toEqual({
      status: "extracted",
      brief,
      destination: destinations[0],
      experiences: [{ id: "e1", name: "Experience e1", destinationId: "d1" }],
      suggested: ["pace", "travelers.0"],
      unclear: brief.unclear,
      unmatched: ["a boat ride"],
    });
    expect(extractIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateExperiences: [
          { id: "e1", name: "Experience e1", type: "darshan" },
          { id: "e2", name: "Experience e2", type: "darshan" },
        ],
        today: "2026-09-13",
      }),
    );
  });

  it("falls back to the structured form when the model is down", async () => {
    const { provider } = providerReturning(async () => {
      throw new AiUnavailableError("timeout", "slow");
    });

    await expect(
      extractJourneyBrief(
        { text: "3 days in Tirumala", locale: "en" },
        {
          provider,
          loadCandidates: async () => ({ destinations, experiences: [experience("e1", "d1")] }),
        },
      ),
    ).resolves.toEqual({ status: "unavailable", reason: "timeout" });
  });

  it("does not call a model when nothing is published to choose from", async () => {
    const { provider, extractIntent } = providerReturning(ok);

    await expect(
      extractJourneyBrief(
        { text: "3 days in Tirumala", locale: "en" },
        { provider, loadCandidates: async () => ({ destinations: [], experiences: [] }) },
      ),
    ).resolves.toEqual({ status: "unavailable", reason: "no_published_experiences" });
    expect(extractIntent).not.toHaveBeenCalled();
  });
});
