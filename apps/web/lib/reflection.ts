/**
 * The reflection questions and the shape of their answers (PRD F16, PRD-CMPL-002).
 *
 * A leaf module with no imports, because the reflection form is a client component and
 * `lib/record.ts` reaches Supabase through `next/headers`. Pulling the question list out
 * of there is what keeps a three-textarea form from dragging the server client into the
 * browser bundle — which is a build error in Next 15, and would have been dead weight even
 * if it were not.
 */
/**
 * PRD F16's three questions, verbatim.
 *
 * Open, optional, skippable, and PRIVATE — `journey_records` is owner-only with no Ops
 * policy at all. Nothing here is analysed, ranked, or fed to a model; the third question
 * is the only one that goes anywhere, and only if the traveler chooses to turn it into a
 * report.
 */
export type ReflectionAnswers = {
  most_meaningful?: string;
  do_differently?: string;
  got_wrong?: string;
};

/*
 * The keys are the TRD’s, verbatim — TRD §4.6 fixes `reflection_answers` as
 * `{ "most_meaningful", "do_differently", "got_wrong" }`, and migration 0005’s column
 * comment repeats it. Prettier names here would have made this jsonb a second shape that
 * nothing else in the system could query against.
 */
export const REFLECTION_QUESTIONS = [
  { key: "most_meaningful" as const, question: "What was most meaningful?" },
  { key: "do_differently" as const, question: "What would you do differently?" },
  {
    key: "got_wrong" as const,
    question: "Anything we got wrong?",
    /*
     * PRD F16: the last one offers to create a Report (F14). Offered, never automatic —
     * a traveler reflecting privately has not asked us to file anything on their behalf.
     */
    offersReport: true,
  },
] as const;
