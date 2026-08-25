/**
 * Grounding checks, enforced in code (TRD §7.3.1, TRD-AI-002).
 *
 * Prompts are a request; these are the control. A model asked nicely not to invent a
 * darshan time will still do it occasionally, and the resulting sentence is indistinguishable
 * from a true one on screen — which is the whole reason Mandhira has a trust model.
 */

export class NotGroundedError extends Error {
  readonly code = "not_grounded";
  readonly offending: string[];

  constructor(offending: string[]) {
    super(`AI output contains values absent from its grounding: ${offending.join(", ")}`);
    this.name = "NotGroundedError";
    this.offending = offending;
  }
}

/**
 * Anything that reads as a claim about the world: a time, a date, a duration, an amount.
 *
 * Deliberately broad. A false positive costs a fallback to template copy, which is a
 * slightly duller sentence; a false negative costs a traveler standing at a closed gate.
 */
const CLAIM_PATTERNS: RegExp[] = [
  // Times: 6:30, 06:30, 6.30 am, 6 pm, 6am
  /\b\d{1,2}[:.]\d{2}\s*(?:a\.?m\.?|p\.?m\.?)?\b/gi,
  /\b\d{1,2}\s*(?:a\.?m\.?|p\.?m\.?)\b/gi,
  // Dates: 2026-10-12, 12/10/2026, 12 October
  /\b\d{4}-\d{2}-\d{2}\b/g,
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
  /\b\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/gi,
  // Money: ₹500, Rs 500, INR 500
  /(?:₹|\brs\.?\s*|\binr\s*)\d[\d,]*(?:\.\d+)?/gi,
  // Quantities with a unit: 60 days, 3.1 km, 45 minutes, 2000 m
  /\b\d[\d,]*(?:\.\d+)?\s*(?:days?|hours?|hrs?|minutes?|mins?|km|kms?|metres?|meters?|m)\b/gi,
];

/**
 * Every claim-shaped value in a piece of text.
 *
 * Exported because the same extraction has to run over both the output and the grounding
 * input — comparing them any other way would compare different notions of "a number".
 */
export function extractClaims(text: string): string[] {
  const found = new Set<string>();

  for (const pattern of CLAIM_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      found.add(normalise(match[0]));
    }
  }

  return [...found];
}

/**
 * Throw unless every timing, date, requirement, price or quantity in `output` also appears
 * in `grounding` (TRD §7.3.1).
 *
 * The caller's move on failure is to fall back to template copy, never to show the output
 * with a caveat: a warning label does not make an invented darshan time less wrong.
 */
export function assertGrounded(output: string, grounding: string): void {
  const allowed = new Set(extractClaims(grounding));
  const offending = extractClaims(output).filter((claim) => !allowed.has(claim));

  if (offending.length > 0) throw new NotGroundedError(offending);
}

/** Non-throwing form, for callers that want to choose their own fallback. */
export function isGrounded(output: string, grounding: string): boolean {
  try {
    assertGrounded(output, grounding);
    return true;
  } catch {
    return false;
  }
}

/**
 * Drop any experience id the model produced that was not in the candidate list
 * (PRD-INT-005, TRD §7.2).
 *
 * The schema constrains the model to these ids, and this checks the constraint held.
 * Both, because a schema enum is a request to the provider and this is a fact about what
 * we will accept — and the acceptance criterion is 100% of hallucinated ids blocked.
 */
export function keepKnownIds<T extends { experienceId: string }>(
  proposed: T[],
  candidates: { id: string }[],
): { kept: T[]; rejected: string[] } {
  const known = new Set(candidates.map((c) => c.id));
  const kept: T[] = [];
  const rejected: string[] = [];

  for (const item of proposed) {
    if (known.has(item.experienceId)) kept.push(item);
    else rejected.push(item.experienceId);
  }

  return { kept, rejected };
}

/**
 * A stable fingerprint of the grounding input.
 *
 * Order-independent over the candidate list so that two requests grounded in the same
 * published knowledge share a cache entry regardless of how the query happened to sort.
 * Changing the published knowledge changes the hash, so a cache entry can never outlive
 * the facts it was grounded in (TRD §7.3.6).
 */
export function groundingHash(parts: {
  candidates?: { id: string }[];
  locale?: string;
  destinationId?: string;
  extra?: string;
}): string {
  const ids = [...(parts.candidates ?? []).map((c) => c.id)].sort();
  return fnv1a(
    JSON.stringify({
      ids,
      locale: parts.locale ?? "",
      destinationId: parts.destinationId ?? "",
      extra: parts.extra ?? "",
    }),
  );
}

/** Hash of the user's own input, kept separate so one can change without the other. */
export function inputHash(text: string): string {
  return fnv1a(text.trim().toLowerCase());
}

/**
 * FNV-1a, 64-bit, as hex.
 *
 * A cache key, not a security primitive: it only needs to be stable, fast and
 * collision-resistant enough that two different questions do not share an answer. Using
 * `crypto.subtle` would make every call site async for no benefit here.
 */
function fnv1a(input: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;

  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash ^ BigInt(input.charCodeAt(i))) * prime) & mask;
  }

  return hash.toString(16).padStart(16, "0");
}

/**
 * Reduce a claim to what it actually says.
 *
 * "6:30 PM", "6.30pm" and "06:30 p.m." are one claim; so are "45 minutes" and "45 mins",
 * and "₹500" and "Rs 500". Without this, a model that rephrases a true fact would be
 * accused of inventing it, and the caller would fall back to template copy for no reason.
 */
function normalise(value: string): string {
  let out = value.toLowerCase().replace(/[\s,]/g, "");

  // Currency: one symbol, whatever it was written as.
  out = out.replace(/^(?:₹|rs\.?|inr)/, "₹");

  // Meridiem: strip the dots before the units pass turns them into something else.
  out = out.replace(/([ap])\.m\.?/g, "$1m");

  // Units, to a canonical short form.
  out = out
    .replace(/(\d)(?:days?)$/, "$1d")
    .replace(/(\d)(?:hours?|hrs?)$/, "$1h")
    .replace(/(\d)(?:minutes?|mins?)$/, "$1min")
    .replace(/(\d)(?:kms?|kilometres?|kilometers?)$/, "$1km")
    .replace(/(\d)(?:metres?|meters?)$/, "$1m");

  // Month names to their three-letter stem: "12october" and "12oct" are the same date.
  out = out.replace(
    /(\d+)(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/,
    (_, day: string, month: string) => `${day}${month}`,
  );

  // Times: a dot separator is a colon.
  out = out.replace(/(\d)\.(\d)/, "$1:$2");

  // Leading zeros carry no meaning: "06:30" is "6:30".
  return out.replace(/(^|[^\d])0+(\d)/g, "$1$2");
}
