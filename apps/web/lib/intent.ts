import { createAiCacheStore, createAiCallLog } from "@mandhira/db/ai-store";
import { createServiceRoleSupabase } from "@mandhira/db/client/server";
import {
  AiUnavailableError,
  createVercelAiProvider,
  errorCode,
  isAiConfigured,
  NotGroundedError,
  type AiProvider,
  type CandidateExperience,
  type ExtractedBrief,
} from "@mandhira/providers";

import { closestMatches } from "./closest-matches";
import { getDestinationCards, getDestinationPage, type ExperienceCard } from "./knowledge";

/** TRD §7.2: the model chooses from at most 200 published experiences. */
const MAX_CANDIDATES = 200;
/** Destinations considered when the traveler did not name one we could resolve. */
const DESTINATIONS_WITHOUT_HINT = 5;

export type IntentDestination = { id: string; slug: string; name: string };

/** An experience the brief named, with what the review screen needs to show it. */
export type IntentExperience = { id: string; name: string; destinationId: string };

export type IntentCandidates = {
  destinations: IntentDestination[];
  experiences: ExperienceCard[];
};

export type IntentResult =
  | {
      status: "extracted";
      brief: ExtractedBrief;
      destination: IntentDestination | null;
      /** The experiences the brief picked, by name. A pick outside the vocabulary is dropped. */
      experiences: IntentExperience[];
      /** Every field the model inferred rather than read (PRD-INT-003: each needs a tap). */
      suggested: string[];
      unclear: ExtractedBrief["unclear"];
      unmatched: string[];
      /**
       * PRD-INT-005: each unmatched request with the closest PUBLISHED experiences by name —
       * never invented, and added only if the traveler taps one.
       */
      unmatchedMatches: { text: string; closest: IntentExperience[] }[];
    }
  /** The planner falls back to the structured form (TRD §5.5); never an error screen. */
  | { status: "unavailable"; reason: string };

/**
 * The closed vocabulary the model may name: published experiences only, so an unpublished
 * or unverified entry is absent rather than discouraged (TRD §7.2).
 */
export async function loadIntentCandidates(
  locale: string,
  destinationHint?: string | undefined,
): Promise<IntentCandidates> {
  if (destinationHint) {
    const page = await getDestinationPage(destinationHint, locale);
    if (page) {
      return {
        destinations: [summary(page.destination)],
        experiences: page.experiences.slice(0, MAX_CANDIDATES),
      };
    }
  }

  const cards = await getDestinationCards(locale, DESTINATIONS_WITHOUT_HINT);
  const pages = (
    await Promise.all(cards.map((card) => getDestinationPage(card.slug, locale)))
  ).filter((page): page is NonNullable<typeof page> => page !== null);

  return {
    destinations: pages.map((page) => summary(page.destination)),
    experiences: pages
      .flatMap((page) => page.experiences)
      .sort((a, b) => b.editorialWeight - a.editorialWeight)
      .slice(0, MAX_CANDIDATES),
  };
}

/**
 * PRD F3: a traveler's own words → a Journey Brief they review before anything is built.
 *
 * Nothing is planned or saved here. The brief comes back with every inference labelled and
 * every unmatched request named, and the review screen (A08) turns it into a plan only when
 * the traveler confirms it.
 */
export async function extractJourneyBrief(
  input: { text: string; locale: string; destinationHint?: string | undefined },
  options: {
    provider?: AiProvider;
    env?: NodeJS.ProcessEnv;
    loadCandidates?: typeof loadIntentCandidates;
    today?: string;
  } = {},
): Promise<IntentResult> {
  if (!options.provider && !isAiConfigured(options.env ?? process.env)) {
    return { status: "unavailable", reason: "not_configured" };
  }

  const candidates = await (options.loadCandidates ?? loadIntentCandidates)(
    input.locale,
    input.destinationHint,
  );
  if (candidates.experiences.length === 0) {
    return { status: "unavailable", reason: "no_published_experiences" };
  }

  const provider = options.provider ?? defaultProvider();
  const vocabulary: CandidateExperience[] = candidates.experiences.map((experience) => ({
    id: experience.id,
    name: experience.name.text,
    type: experience.experienceType,
  }));

  try {
    const { value: brief } = await provider.extractIntent({
      text: input.text,
      locale: input.locale,
      candidateExperiences: vocabulary,
      ...(candidates.destinations.length === 1
        ? { destinationId: candidates.destinations[0]!.id }
        : {}),
      today: options.today ?? new Date().toISOString().slice(0, 10),
    });

    return {
      status: "extracted",
      brief,
      destination: resolveDestination(brief, candidates),
      experiences: pickedExperiences(brief, candidates),
      suggested: suggestedFields(brief),
      unclear: brief.unclear,
      unmatched: brief.unmatched,
      unmatchedMatches: unmatchedMatches(brief, candidates),
    };
  } catch (cause) {
    if (cause instanceof AiUnavailableError || cause instanceof NotGroundedError) {
      return { status: "unavailable", reason: errorCode(cause) };
    }
    throw cause;
  }
}

function unmatchedMatches(
  brief: ExtractedBrief,
  candidates: IntentCandidates,
): { text: string; closest: IntentExperience[] }[] {
  const picked = new Set([...brief.mustDo, ...brief.wouldLike].map((pick) => pick.experienceId));
  const named = candidates.experiences.map((experience) => ({
    id: experience.id,
    name: experience.name.text,
    destinationId: experience.destinationId,
  }));
  return brief.unmatched.map((text) => ({
    text,
    closest: closestMatches(text, named, { exclude: picked }),
  }));
}

function defaultProvider(): AiProvider {
  const service = createServiceRoleSupabase();
  return createVercelAiProvider({
    cache: createAiCacheStore(service),
    log: createAiCallLog(service),
  });
}

/**
 * The destination the brief is about: where the experiences the traveler named are, or the
 * one destination that was offered, or the one whose name they wrote. Null when it is
 * genuinely unclear — the review screen then asks rather than guessing.
 */
function resolveDestination(
  brief: ExtractedBrief,
  candidates: IntentCandidates,
): IntentDestination | null {
  const chosen = new Set([...brief.mustDo, ...brief.wouldLike].map((pick) => pick.experienceId));
  const counts = new Map<string, number>();
  for (const experience of candidates.experiences) {
    if (chosen.has(experience.id)) {
      counts.set(experience.destinationId, (counts.get(experience.destinationId) ?? 0) + 1);
    }
  }

  const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (top) return candidates.destinations.find((d) => d.id === top[0]) ?? null;
  if (candidates.destinations.length === 1) return candidates.destinations[0]!;

  const written = brief.destination?.text?.trim().toLowerCase();
  if (!written) return null;
  return (
    candidates.destinations.find(
      (d) => written.includes(d.name.toLowerCase()) || written.includes(d.slug.replace(/-/g, " ")),
    ) ?? null
  );
}

function pickedExperiences(
  brief: ExtractedBrief,
  candidates: IntentCandidates,
): IntentExperience[] {
  const picked = new Set([...brief.mustDo, ...brief.wouldLike].map((pick) => pick.experienceId));
  return candidates.experiences
    .filter((experience) => picked.has(experience.id))
    .map((experience) => ({
      id: experience.id,
      name: experience.name.text,
      destinationId: experience.destinationId,
    }));
}

function suggestedFields(brief: ExtractedBrief): string[] {
  return [
    ...(brief.destination?.suggested ? ["destination"] : []),
    ...(brief.startDate?.suggested ? ["startDate"] : []),
    ...(brief.dayCount?.suggested ? ["dayCount"] : []),
    ...(brief.pace?.suggested ? ["pace"] : []),
    ...brief.travelers.flatMap((t, index) => (t.suggested ? [`travelers.${index}`] : [])),
    ...brief.mustDo.flatMap((p) => (p.suggested ? [`mustDo.${p.experienceId}`] : [])),
    ...brief.wouldLike.flatMap((p) => (p.suggested ? [`wouldLike.${p.experienceId}`] : [])),
    ...brief.fixedCommitments.flatMap((c, index) =>
      c.suggested ? [`fixedCommitments.${index}`] : [],
    ),
  ];
}

function summary(destination: { id: string; slug: string; name: { text: string } }) {
  return { id: destination.id, slug: destination.slug, name: destination.name.text };
}
