/**
 * Stored values, in words an operator reads (design review: "raw lowercase values such as
 * 'temple', 'walk', 'draft→in_review'; mixed status casing").
 *
 * Seventeen places turned an enum into text with `.replace(/_/g, " ")`, which gave
 * "temple", "in review" and "official authority" in lowercase beside other screens' "In
 * review" — so the same state looked different depending on where you met it. One
 * function now decides how a stored value reads, everywhere.
 *
 * Sentence case, like the rest of the product (PRD §12.7). Most values read fine once
 * cased; the ones below are the few where the literal is jargon or simply wrong in
 * English ("human reviewed" is not a phrase anybody says).
 */
const WORDS: Record<string, string> = {
  // Verification and publishing
  in_review: "In review",
  human_reviewed: "Reviewed by a person",
  ai_extracted: "Extracted by AI",
  ai_draft: "AI draft",
  // Sources
  official_authority: "Official authority",
  official_destination_org: "Official destination organisation",
  licensed_provider: "Licensed provider",
  structured_service: "Structured service",
  curated_research: "Curated research",
  user_report: "Traveler report",
  url_monitor: "Watches a web page",
  file_upload: "File upload",
  // Travel
  public_transport: "Public transport",
  // Availability
  always_during_opening: "Whenever it is open",
  daily_fixed_times: "Daily, at fixed times",
  weekly_pattern: "On set days of the week",
  date_range: "Between two dates",
  calendar_dates: "On particular dates",
  on_request: "On request",
  // Travelers
  limited_walking: "Limited walking",
  needs_rest_frequently: "Needs rest often",
};

/** How a stored value reads. Unknown values are cased rather than shown raw. */
export function humanLabel(value: string | null | undefined): string {
  if (!value) return "";
  const known = WORDS[value];
  if (known) return known;
  const spaced = value.replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * The same label for the MIDDLE of a sentence: "UPSRTC public transport from the station",
 * not "UPSRTC Public transport". Sentence case capitalises the start of a label, and a
 * label composed into a longer phrase is no longer at the start of anything. An initialism
 * such as "URL" or "AI" keeps its capitals wherever it lands.
 */
export function inSentence(value: string | null | undefined): string {
  const label = humanLabel(value);
  if (/^[A-Z]{2,}\b/.test(label)) return label;
  return label.charAt(0).toLowerCase() + label.slice(1);
}

/**
 * A stored identifier — lowercase, words joined by underscores, nothing else. Used to tell
 * an enum value (which should be labelled) from free text an operator wrote (which must be
 * shown exactly as written).
 */
export function looksLikeStoredValue(value: string): boolean {
  return /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(value);
}
