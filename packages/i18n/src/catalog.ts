/**
 * Message-catalog consistency — the half of translation quality a machine can actually
 * judge (PRD-LANG-001).
 *
 * It judges STRUCTURE, never wording. Whether a Telugu sentence is one a pilgrim would
 * recognise is a question only a Telugu speaker can answer, and nothing in this file
 * pretends otherwise; `pnpm i18n:review` builds the pack they read. What this does catch
 * is the class of mistake that survives every human review because it is invisible in
 * prose: a placeholder renamed on one side, a plural collapsed to a single form, a brace
 * left open. Each of those ships as a runtime throw or a sentence with a hole in it, in a
 * language the person who edited it cannot read.
 *
 * Hand-written rather than @formatjs's parser: that package is in the tree only because
 * next-intl depends on it, and pnpm does not hoist, so importing it from a workspace that
 * has not declared it resolves today and breaks on the next install. The grammar we need
 * is small enough to own.
 */

/** One argument as it appears in a message: `{count, plural, one {…} other {…}}`. */
export type MessageArgument = {
  name: string;
  /** `plural`, `select`, `selectordinal`, `number`, `date`, `time`, or "" for a bare `{name}`. */
  type: string;
  /** Branch selectors for plural/select arguments, e.g. `["=0", "other"]`. */
  selectors: string[];
};

export type CatalogProblem = {
  key: string;
  /** What is wrong, in the words a person fixing it would use. */
  problem: string;
};

/**
 * A run of characters that can make up an argument name or a type. ICU allows far more
 * than ASCII here, and a translator who types a placeholder in their own script should be
 * told that nothing passes it in — not that their message is unparseable.
 */
const NAME_CHARACTER = /[^\s,{}#]/;

/**
 * Reads the arguments out of one ICU message.
 *
 * Throws on a message it cannot parse, because an unparseable message is itself the
 * finding: next-intl will throw on it at render time, on somebody's phone.
 */
export function messageArguments(message: string): MessageArgument[] {
  const found: MessageArgument[] = [];
  const end = parseText(message, 0, found);
  if (end !== message.length) {
    throw new Error(`unmatched "}" at position ${end}`);
  }
  return found;
}

/** Parses message text until the string ends or an unmatched `}` is reached. */
function parseText(s: string, start: number, out: MessageArgument[]): number {
  let i = start;
  while (i < s.length) {
    const c = s[i];
    if (c === "'") {
      // ICU escaping: '' is a literal apostrophe, and '{ starts a literal run.
      if (s[i + 1] === "'") {
        i += 2;
        continue;
      }
      if (s[i + 1] === "{" || s[i + 1] === "}" || s[i + 1] === "#") {
        const close = s.indexOf("'", i + 2);
        i = close === -1 ? s.length : close + 1;
        continue;
      }
      i += 1;
      continue;
    }
    if (c === "}") return i;
    if (c === "{") {
      i = parseArgument(s, i, out);
      continue;
    }
    i += 1;
  }
  return i;
}

/** Parses one `{…}` argument, starting at its opening brace. Returns the index after it. */
function parseArgument(s: string, start: number, out: MessageArgument[]): number {
  let i = skipSpace(s, start + 1);
  const nameStart = i;
  while (i < s.length && NAME_CHARACTER.test(s[i] ?? "")) i += 1;
  const name = s.slice(nameStart, i);
  if (!name) throw new Error(`argument with no name at position ${start}`);

  i = skipSpace(s, i);
  if (s[i] === "}") {
    out.push({ name, type: "", selectors: [] });
    return i + 1;
  }
  if (s[i] !== ",") throw new Error(`expected "," or "}" after {${name}`);

  i = skipSpace(s, i + 1);
  const typeStart = i;
  while (i < s.length && NAME_CHARACTER.test(s[i] ?? "")) i += 1;
  const type = s.slice(typeStart, i);
  i = skipSpace(s, i);

  if (type !== "plural" && type !== "select" && type !== "selectordinal") {
    // number/date/time: what follows is a style, not a submessage. Skip to our own close.
    let depth = 1;
    while (i < s.length && depth > 0) {
      if (s[i] === "{") depth += 1;
      else if (s[i] === "}") depth -= 1;
      i += 1;
    }
    if (depth !== 0) throw new Error(`unclosed {${name}, ${type}`);
    out.push({ name, type, selectors: [] });
    return i;
  }

  if (s[i] !== ",") throw new Error(`expected "," after {${name}, ${type}`);
  i = skipSpace(s, i + 1);

  const selectors: string[] = [];
  while (i < s.length && s[i] !== "}") {
    const selectorStart = i;
    while (i < s.length && s[i] !== "{" && !/\s/.test(s[i] ?? "")) i += 1;
    const selector = s.slice(selectorStart, i).trim();
    i = skipSpace(s, i);
    if (s[i] !== "{") throw new Error(`branch "${selector}" of {${name}} has no message`);
    if (!selector) throw new Error(`a branch of {${name}} has no selector`);
    selectors.push(selector);
    // The branch body is message text again, so nested arguments are found here.
    const bodyEnd = parseText(s, i + 1, out);
    if (s[bodyEnd] !== "}") throw new Error(`branch "${selector}" of {${name}} is not closed`);
    i = skipSpace(s, bodyEnd + 1);
  }
  if (s[i] !== "}") throw new Error(`{${name}, ${type}} is not closed`);

  out.push({ name, type, selectors });
  return i + 1;
}

function skipSpace(s: string, i: number): number {
  let j = i;
  while (j < s.length && /\s/.test(s[j] ?? "")) j += 1;
  return j;
}

/** A nested catalog flattened to `a.b.c` keys, the way next-intl addresses them. */
export function flattenCatalog(catalog: unknown, prefix = ""): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(catalog as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") Object.assign(flat, flattenCatalog(value, path));
    else flat[path] = String(value);
  }
  return flat;
}

/**
 * Everything wrong with a translated catalog, measured against the English one.
 *
 * Every problem here is one that makes a string render wrongly or not at all — a judgement
 * about the STRING, never about the language. Wording is the review pack's business.
 */
export function catalogProblems(reference: unknown, translated: unknown): CatalogProblem[] {
  const en = flattenCatalog(reference);
  const other = flattenCatalog(translated);
  const problems: CatalogProblem[] = [];

  for (const key of Object.keys(other)) {
    if (!(key in en)) {
      problems.push({ key, problem: "not in the English catalogue, so nothing ever reads it" });
    }
  }

  for (const [key, source] of Object.entries(en)) {
    const target = other[key];

    if (target === undefined) {
      problems.push({ key, problem: "missing — the screen would fall back to English" });
      continue;
    }
    if (target.trim() === "") {
      problems.push({ key, problem: "blank — the screen would show nothing at all" });
      continue;
    }

    let sourceArgs: MessageArgument[];
    let targetArgs: MessageArgument[];
    try {
      sourceArgs = messageArguments(source);
    } catch (error) {
      problems.push({ key, problem: `the English message does not parse: ${asText(error)}` });
      continue;
    }
    try {
      targetArgs = messageArguments(target);
    } catch (error) {
      problems.push({
        key,
        problem: `does not parse, so it throws when rendered: ${asText(error)}`,
      });
      continue;
    }

    const sourceNames = names(sourceArgs);
    const targetNames = names(targetArgs);

    for (const name of targetNames) {
      if (!sourceNames.includes(name)) {
        problems.push({ key, problem: `uses {${name}}, which nothing passes in` });
      }
    }
    for (const name of sourceNames) {
      if (!targetNames.includes(name)) {
        problems.push({ key, problem: `never uses {${name}}, so that value is lost` });
        continue;
      }

      const from = sourceArgs.find((a) => a.name === name);
      const to = targetArgs.find((a) => a.name === name);
      if (!from || !to) continue;

      if (from.type !== to.type) {
        problems.push({
          key,
          problem:
            from.type === "plural" || from.type === "selectordinal"
              ? `{${name}} lost its plural forms, so one and many read the same`
              : `{${name}} is a ${from.type || "plain value"} in English but a ${to.type || "plain value"} here`,
        });
        continue;
      }

      if (to.type === "plural" || to.type === "selectordinal" || to.type === "select") {
        if (!to.selectors.includes("other")) {
          problems.push({ key, problem: `{${name}} has no "other" branch, which ICU requires` });
        }
        for (const selector of from.selectors) {
          // Only the exact matches: which plural CATEGORIES a language needs is the
          // language's business (Telugu and Hindi do not need English's), but `=0` is a
          // deliberate sentence for a specific number and dropping it loses that sentence.
          if (selector.startsWith("=") && !to.selectors.includes(selector)) {
            problems.push({
              key,
              problem: `{${name}} has no "${selector}" branch, so that case falls into "other"`,
            });
          }
        }
      }
    }
  }

  return problems;
}

/**
 * Keys whose translation is character-for-character the English — a REVIEW note, not a
 * failure. Plenty are correct ("{degrees}°C"), so this only ever points a human at a list.
 */
export function untranslatedKeys(reference: unknown, translated: unknown): string[] {
  const en = flattenCatalog(reference);
  const other = flattenCatalog(translated);
  return Object.keys(en).filter((key) => other[key] !== undefined && other[key] === en[key]);
}

function names(args: MessageArgument[]): string[] {
  return [...new Set(args.map((a) => a.name))].sort();
}

function asText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
