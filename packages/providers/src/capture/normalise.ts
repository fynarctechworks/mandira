/**
 * Turning a fetched page into text two runs can be compared by.
 *
 * WHY THIS MATTERS MORE THAN IT LOOKS. The whole ingestion feature dies of noise if this is
 * naive. A temple's page carrying a session id, a rotating banner, a "last updated" clock
 * or a cache-busted asset URL would produce a diff on every single cycle, and a queue that
 * cries wolf every morning is abandoned inside a week — after which a real timing change
 * sits unread among fifty false ones.
 *
 * So this deliberately throws away far more than a reader would want: scripts, styles,
 * comments, every attribute, and all whitespace structure. What survives is the visible
 * words in order, which is exactly and only what a change candidate is about.
 */

/** Elements whose text is markup machinery rather than content. */
const DROPPED = ["script", "style", "noscript", "template", "svg", "iframe"];

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
};

/**
 * HTML (or any text) reduced to comparable lines.
 *
 * Block-level tags become line breaks so that a list of timings stays a list rather than
 * collapsing into one long line — a diff over lines is readable, a diff over one 40 kB
 * line is not.
 */
export function normaliseCapture(body: string, contentType = "text/html"): string {
  let text = body;

  if (contentType.includes("html") || /<\/?[a-z][\s\S]*>/i.test(body)) {
    text = text.replace(/<!--[\s\S]*?-->/g, " ");

    for (const tag of DROPPED) {
      text = text.replace(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}\\s*>`, "gi"), " ");
      // An unclosed <svg> or a self-closing <iframe/> would otherwise survive as attributes.
      text = text.replace(new RegExp(`<${tag}\\b[^>]*/?>`, "gi"), " ");
    }

    /*
     * Every original line break becomes a space FIRST, so that only the block tags below
     * decide where lines fall. Without this, a page that reflows its own indentation
     * — same words, different wrapping — produces a diff on every element it touched, and
     * the queue fills with changes nobody made. A test caught exactly that.
     */
    text = text.replace(/\s+/g, " ");

    // Block boundaries become newlines BEFORE tags are stripped, or every visible word in
    // the document ends up on one line.
    text = text.replace(/<\s*(br|p|div|li|tr|h[1-6]|section|article|table)\b[^>]*>/gi, "\n");
    text = text.replace(/<\/\s*(p|div|li|tr|h[1-6]|section|article|table)\s*>/gi, "\n");
    text = text.replace(/<[^>]*>/g, " ");
  }

  text = decodeEntities(text);

  return (
    text
      .split("\n")
      // Collapse runs of whitespace INSIDE a line; a page reflowing its indentation is not a
      // change to anything a traveler would notice.
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter((line) => line.length > 0)
      .join("\n")
  );
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => safeCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => ENTITIES[name.toLowerCase()] ?? whole);
}

/** A malformed numeric entity must not take the whole run down. */
function safeCodePoint(value: number): string {
  if (!Number.isFinite(value) || value < 0 || value > 0x10ffff) return "";
  try {
    return String.fromCodePoint(value);
  } catch {
    return "";
  }
}

/**
 * The same normalisation applied to an excerpt before it is looked for.
 *
 * An operator pastes an excerpt out of a rendered page, so it arrives with the spacing the
 * browser showed, not the spacing the source had. Comparing it raw against normalised
 * capture text would report every excerpt as missing on the first run.
 */
export function normaliseExcerpt(excerpt: string): string {
  return normaliseCapture(excerpt).replace(/\n/g, " ").replace(/\s+/g, " ").trim();
}
