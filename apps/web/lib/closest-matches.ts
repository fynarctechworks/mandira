/**
 * The closest published experiences to something a traveler named that Mandhira does not
 * know (PRD-INT-005).
 *
 * Deliberately plain string similarity over the vocabulary the model was already given — the
 * published experiences, and nothing else. A suggestion can therefore only ever be a real,
 * published entry; nothing is invented, and nothing is added until the traveler taps it.
 *
 * Similarity is the Dice coefficient over character trigrams, which tolerates transliteration
 * drift ("suprabhatham" / "Suprabhatam Seva") and works on Telugu and Devanagari as well as
 * Latin script, because it compares code points rather than words.
 */

export type NamedCandidate = { id: string; name: string };

/** Below this a "match" is noise: two unrelated names share a few trigrams by chance. */
const MIN_SIMILARITY = 0.3;
const DEFAULT_LIMIT = 3;

export function closestMatches<T extends NamedCandidate>(
  term: string,
  candidates: T[],
  {
    limit = DEFAULT_LIMIT,
    exclude = new Set<string>(),
  }: { limit?: number; exclude?: Set<string> } = {},
): T[] {
  const wanted = trigrams(term);
  if (wanted.size === 0) return [];

  return candidates
    .filter((candidate) => !exclude.has(candidate.id))
    .map((candidate) => ({ candidate, score: bestScore(wanted, candidate.name) }))
    .filter(({ score }) => score >= MIN_SIMILARITY)
    .sort((a, b) => b.score - a.score || a.candidate.name.localeCompare(b.candidate.name))
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}

/**
 * The better of the whole name and its best-matching run of words, so "aarti" finds
 * "Evening Aarti (fixture)" instead of being outvoted by the words around it.
 */
function bestScore(wanted: Set<string>, name: string): number {
  const words = normalise(name).split(" ").filter(Boolean);
  let best = dice(wanted, trigrams(name));
  for (let start = 0; start < words.length; start += 1) {
    for (let end = start + 1; end <= words.length; end += 1) {
      best = Math.max(best, dice(wanted, trigrams(words.slice(start, end).join(" "))));
    }
  }
  return best;
}

export function similarity(a: string, b: string): number {
  return dice(trigrams(a), trigrams(b));
}

function dice(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared += 1;
  return (2 * shared) / (a.size + b.size);
}

function trigrams(value: string): Set<string> {
  const text = normalise(value);
  if (!text) return new Set();
  const padded = [..." ", ...text, ..." "];
  const grams = new Set<string>();
  for (let index = 0; index + 3 <= padded.length; index += 1) {
    grams.add(padded.slice(index, index + 3).join(""));
  }
  return grams;
}

/** Lower case, accents folded, brackets and punctuation dropped, spaces collapsed. */
function normalise(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, (mark) => (/[ऀ-෿]/.test(mark) ? mark : ""))
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}
