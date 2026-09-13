import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Every word a traveler reads comes from the message catalogs (PRD-LANG-001, R6).
 *
 * A Telugu-speaking traveler who switches language and still meets "Plan a journey" has not
 * been given a Telugu app; they have been given an English app with a few Telugu screens.
 * Reviewing for that holds until the next person writes a string, so this is a test instead,
 * in the same spirit as `copy.test.ts`: it reads the traveler app's `.tsx` and fails on any
 * English a person could see that did not come through `t(...)`.
 *
 * WHY THE TYPESCRIPT PARSER RATHER THAN REGEX. `copy.test.ts` looks for a handful of words,
 * so a loose regex over all strings is fine there. This test has to tell `className="flex"`
 * from `title="Flexible"`, and `{t("save")}` from `{saved ? "Saved" : "Save"}` — which is a
 * question about where a string sits in the tree, not what it looks like. `typescript` is
 * already a dev dependency of this app, so parsing costs nothing new.
 *
 * WHAT IS FLAGGED (a string containing a Latin letter, in any of these positions):
 * 1. JSX text between tags, including text that spans lines.
 * 2. A string in a TEXT attribute (`aria-label`, `title`, `placeholder`, `alt`, `label`, …),
 *    whether written directly or inside `{…}` — a ternary, a `??` fallback, a template.
 * 3. A string literal written as a JSX child inside `{…}`, e.g. `{busy ? "Saving…" : "Save"}`.
 * 4. A prose-looking string passed to ANY prop of a component (`<EmptyState heading="…">`).
 *    Heuristic, documented because it is one: component props also carry `variant="outline"`
 *    and `side="bottom"`, so only a value that looks like words a person reads counts —
 *    it has a space, or starts with a capital followed by a lower-case letter. Tokens such
 *    as `icon-lg` or `step_free` do not.
 * 5. A prose-looking string handed to a state setter or a toast
 *    (`setProblem("That didn't save.")`, `toast("Saved")`), or in the `message`/`label`/…
 *    property of an object handed to one, which is copy on its way to the screen by another
 *    road.
 *
 * WHAT IS NOT FLAGGED:
 * - Code-valued attributes: className, id, href, type, name, key, role, data-*, and the rest
 *   of `CODE_ATTRS`. Their values are for the browser, not the person.
 * - Arguments of a call (`t("key")`, `format("HH:mm")`), comparison operands
 *   (`tier === "fixed"`), element-access keys (`labels["fixed"]`) and object keys.
 * - Content from props or the database: `{place.name.text}` has no literal in it to find.
 * - "Mandhira" (the brand, kept in Latin script in every catalog), punctuation, symbols and
 *   numbers — there is nothing in them to translate.
 * - Test files, for the reason `copy.test.ts` gives.
 */
const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "..");

/** Only the traveler app's screens and components render. `lib/` builds data, not markup. */
const SCAN_ROOTS = ["app", "components"];

const SKIP_DIRS = new Set(["node_modules", ".next", ".next-e2e", ".turbo", "public"]);

/**
 * Paths exempt, each for a stated reason. Prefix match on the path relative to `apps/web`.
 *
 * Kept explicit and small, as in `copy.test.ts`.
 */
const EXEMPT: { path: string; why: string }[] = [
  {
    path: "app/design-system/",
    why: "Staff-only component reference, not linked from the traveler app and not for travelers (D-148, D-163).",
  },
  {
    path: "app/global-error.tsx",
    why: "Renders only when the root layout itself failed, so next-intl never ran: reaching for a translation there would mean reaching for the machinery that just failed.",
  },
];

/** Attributes whose value is text a person reads or hears. */
const TEXT_ATTRS = new Set([
  "aria-label",
  "aria-valuetext",
  "aria-roledescription",
  "aria-placeholder",
  "title",
  "placeholder",
  "alt",
  "label",
  "legend",
  "hint",
  "why",
  "whyLabel",
  "description",
  "heading",
  "caption",
]);

/** Attributes whose value is for the browser or the code, never for a person. */
const CODE_ATTRS = new Set([
  "className",
  "id",
  "href",
  "type",
  "name",
  "key",
  "role",
  "variant",
  "size",
  "side",
  "align",
  "as",
  "src",
  "rel",
  "target",
  "method",
  "action",
  "htmlFor",
  "autoComplete",
  "inputMode",
  "enterKeyHint",
  "lang",
  "dir",
  "locale",
  "value",
  "defaultValue",
  "pattern",
  "form",
  "accept",
  "capture",
  "sizes",
  "loading",
  "decoding",
  "fetchPriority",
  "prefetch",
  "scroll",
  "tone",
  "status",
  "tier",
  "icon",
  "mode",
  "orientation",
  "direction",
  "position",
  "theme",
  "color",
  "state",
  "kind",
  "slot",
  "asChild",
  "style",
  "width",
  "height",
  "min",
  "max",
  "step",
  "encType",
  "referrerPolicy",
  "crossOrigin",
  "download",
  "tabIndex",
  "hidden",
  "spellCheck",
  "translate",
]);

/** Text with nothing to translate: the brand, punctuation, symbols, numbers. */
function hasTranslatableText(raw: string): boolean {
  const text = raw.replace(/\bMandhira\b/g, "");
  return /[A-Za-z]/.test(text);
}

/** Heuristic 4/5: words a person reads rather than a token the code switches on. */
function looksLikeProse(raw: string): boolean {
  const text = raw.trim();
  if (!hasTranslatableText(text)) return false;
  // A URL, a path, a CSS value or a class list is not prose even with spaces in it.
  if (/^(https?:|\/|#|\.|var\(|calc\()/.test(text)) return false;
  return /\s/.test(text) || /^[A-Z][a-z]/.test(text);
}

/**
 * Heuristic 6, stricter than 4 because it looks at every string in the file: a capitalised
 * word or phrase ("Free time", "Temple"), or at least two lower-case words ("left out").
 * Code-shaped tokens are excluded — anything with `/`, `_`, `:`, `=`, `@` or brackets
 * (paths, ids, time zones, class variants), a token joined by `-` in a class list, and
 * ALL-CAPS constants such as `FIXED`.
 */
function looksLikeSentence(raw: string): boolean {
  const text = raw.trim();
  if (!hasTranslatableText(text)) return false;
  // Paths, URLs, ids, enum values, time zones, storage keys and file names.
  if (/[/_:=@[\]{}<>]/.test(text) || /^[\w.-]+\.[a-z]+$/i.test(text)) return false;
  // ALL-CAPS constants such as `FIXED`.
  if (!/[a-z]/.test(text)) return false;

  const words = text.split(/\s+/);
  // A class list: lower-case tokens, at least one of them hyphenated (`flex min-h-11`).
  if (words.every((word) => /^[a-z0-9.-]+$/.test(word)) && words.some((w) => w.includes("-"))) {
    return false;
  }

  if (/^[A-Z][a-z]/.test(text)) return true;
  return words.length >= 2 && words.every((word) => /^[a-z][a-z'’,.…]*$/.test(word));
}

function attrName(node: ts.JsxAttribute): string {
  return node.name.getText();
}

function isComponentTag(tag: ts.JsxTagNameExpression): boolean {
  const name = tag.getText();
  return /^[A-Z]/.test(name) || name.includes(".");
}

/**
 * Whether a literal sits where a string is data for the code rather than text for a person:
 * a call argument, a comparison operand, an element-access key, a property name, a `case`.
 */
function isCodePosition(node: ts.Node, root: ts.Node): boolean {
  let child: ts.Node = node;
  let parent: ts.Node | undefined = node.parent;

  while (parent && child !== root) {
    if (ts.isCallExpression(parent) || ts.isNewExpression(parent)) {
      if (parent.arguments?.some((arg) => arg === child)) return true;
    }
    if (ts.isElementAccessExpression(parent) && parent.argumentExpression === child) return true;
    if (ts.isPropertyAssignment(parent) && parent.name === child) return true;
    if (ts.isCaseClause(parent) && parent.expression === child) return true;
    // Values iterated by the code, e.g. `(["relaxed", "full"] as const).map(...)`.
    if (ts.isArrayLiteralExpression(parent) && isIterated(parent)) return true;
    if (ts.isBinaryExpression(parent)) {
      const op = parent.operatorToken.kind;
      if (
        op === ts.SyntaxKind.EqualsEqualsEqualsToken ||
        op === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
        op === ts.SyntaxKind.EqualsEqualsToken ||
        op === ts.SyntaxKind.ExclamationEqualsToken ||
        op === ts.SyntaxKind.InKeyword
      ) {
        return true;
      }
    }
    // Walking stops at the edge of the expression the literal belongs to.
    if (ts.isJsxExpression(parent) || ts.isJsxAttribute(parent) || ts.isStatement(parent)) {
      return false;
    }
    child = parent;
    parent = parent.parent;
  }

  return false;
}

/** An array literal the code calls a method on (`.map`, `.includes`), through `as const` or parens. */
function isIterated(array: ts.ArrayLiteralExpression): boolean {
  let container: ts.Node = array;
  while (
    container.parent &&
    (ts.isAsExpression(container.parent) ||
      ts.isParenthesizedExpression(container.parent) ||
      ts.isSatisfiesExpression(container.parent))
  ) {
    container = container.parent;
  }
  return (
    !!container.parent &&
    ts.isPropertyAccessExpression(container.parent) &&
    container.parent.expression === container
  );
}

/** The literal text pieces inside an expression that would end up rendered. */
function renderedLiterals(expression: ts.Node): { node: ts.Node; text: string }[] {
  const found: { node: ts.Node; text: string }[] = [];

  function visit(node: ts.Node) {
    // Nested JSX is visited on its own; a function body is not this expression's value.
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
      return;
    }
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return;

    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (!isCodePosition(node, expression)) found.push({ node, text: node.text });
      return;
    }
    if (ts.isTemplateExpression(node)) {
      if (!isCodePosition(node, expression)) {
        const pieces = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)];
        found.push({ node, text: pieces.join(" ") });
      }
      node.templateSpans.forEach((span) => visit(span.expression));
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(expression);
  return found;
}

/**
 * `setStatus({ kind: "problem", message: "…" })`: the text-carrying properties of an object
 * handed to a setter. Only properties named like copy count, so `{ kind: "sending" }` does not.
 */
const TEXT_PROPERTIES = new Set([
  "message",
  "label",
  "title",
  "body",
  "text",
  "description",
  "hint",
]);

function textProperties(object: ts.ObjectLiteralExpression): { node: ts.Node; text: string }[] {
  return object.properties.flatMap((property) =>
    ts.isPropertyAssignment(property) && TEXT_PROPERTIES.has(property.name.getText())
      ? renderedLiterals(property.initializer)
      : [],
  );
}

type Finding = { file: string; line: number; text: string; rule: string };

function scan(file: string, source: string): Finding[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings: Finding[] = [];
  const reported = new Set<ts.Node>();

  function report(node: ts.Node, text: string, rule: string) {
    reported.add(node);
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    findings.push({ file, line: line + 1, text: text.replace(/\s+/g, " ").trim(), rule });
  }

  function visit(node: ts.Node) {
    // 1. JSX text.
    if (ts.isJsxText(node)) {
      if (hasTranslatableText(node.text)) report(node, node.text, "jsx text");
      return;
    }

    // 3. A literal written as a child expression.
    if (ts.isJsxExpression(node) && node.expression && !ts.isJsxAttribute(node.parent)) {
      for (const { node: literal, text } of renderedLiterals(node.expression)) {
        if (hasTranslatableText(text)) report(literal, text, "jsx child string");
      }
    }

    // 2 and 4. Attributes.
    if (ts.isJsxAttribute(node) && node.initializer) {
      const name = attrName(node);
      const element = node.parent.parent as ts.JsxOpeningLikeElement;
      const component = isComponentTag(element.tagName);
      const isText = TEXT_ATTRS.has(name);
      const isCode = CODE_ATTRS.has(name) || name.startsWith("data-") || name.startsWith("on");

      if (isText || (component && !isCode && !name.startsWith("aria-"))) {
        const literals = ts.isStringLiteral(node.initializer)
          ? [{ node: node.initializer, text: node.initializer.text }]
          : node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression
            ? renderedLiterals(node.initializer.expression)
            : [];

        for (const { node: literal, text } of literals) {
          if (isText ? hasTranslatableText(text) : looksLikeProse(text)) {
            report(literal, text, isText ? `attribute ${name}` : `component prop ${name}`);
          }
        }
      }
    }

    // 5. Copy handed to a state setter or a toast.
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(sf);
      if (/^(set[A-Z]\w*|toast(\.\w+)?)$/.test(callee)) {
        for (const arg of node.arguments) {
          const pieces =
            ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)
              ? [{ node: arg, text: arg.text }]
              : ts.isConditionalExpression(arg) || ts.isBinaryExpression(arg)
                ? renderedLiterals(arg)
                : ts.isObjectLiteralExpression(arg)
                  ? textProperties(arg)
                  : [];
          for (const { node: literal, text } of pieces) {
            if (looksLikeProse(text)) report(literal, text, `passed to ${callee}`);
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sf);

  // 6. Prose anywhere else: a label map, a `??` fallback, a returned sentence, page metadata.
  function sweep(node: ts.Node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    // Attributes belong to rules 2 and 4, which know which attribute names are code.
    if (ts.isJsxAttribute(node)) return;
    // Type positions (`kind: "Fixed"` in a type) are never rendered.
    if (ts.isLiteralTypeNode(node)) return;
    if (ts.isExpressionStatement(node) && ts.isStringLiteral(node.expression)) return; // "use client"

    const isLiteral =
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateExpression(node);
    if (isLiteral) {
      if (!reported.has(node) && !isCodePosition(node, sf)) {
        const text = ts.isTemplateExpression(node)
          ? [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(" ")
          : node.text;
        if (looksLikeSentence(text)) report(node, text, "prose string");
      }
      if (!ts.isTemplateExpression(node)) return;
    }
    ts.forEachChild(node, sweep);
  }

  sweep(sf);
  findings.sort((a, b) => a.line - b.line);
  return findings;
}

function tsxFiles(dir: string, base: string): string[] {
  const out: string[] = [];

  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const rel = `${base}/${entry}`;

    if (statSync(full).isDirectory()) {
      out.push(...tsxFiles(full, rel));
    } else if (
      entry.endsWith(".tsx") &&
      !/\.test\.tsx$/.test(entry) &&
      !EXEMPT.some((exempt) => rel === exempt.path || rel.startsWith(exempt.path))
    ) {
      out.push(rel);
    }
  }

  return out;
}

describe("every traveler-facing string comes from the message catalogs (PRD-LANG-001)", () => {
  const files = SCAN_ROOTS.flatMap((root) => tsxFiles(join(appRoot, root), root));

  it("scans a meaningful number of files", () => {
    // A scanner that silently matched nothing would pass forever.
    expect(files.length).toBeGreaterThan(50);
  });

  it("every exemption states a reason", () => {
    for (const exempt of EXEMPT) expect(exempt.why.length).toBeGreaterThan(20);
  });

  it("finds hardcoded English in a sample of the shapes it guards against", () => {
    // Proves the rules still bite, so a refactor of the scanner cannot quietly blind it.
    const sample = `
      const LABELS = { temple: "Temple", zone: "Asia/Kolkata", file: "mandhira-my-data.json" };
      const ROW = "flex min-h-11 items-center gap-2";
      export function Sample({ saved }: { saved: boolean }) {
        const title = place?.name ?? "Free time";
        const [problem, setProblem] = useState<string | null>(null);
        setProblem("That didn't save.");
        setStatus({ kind: "problem", message: saved ? "Sent." : "Not sent." });
        return (
          <section className="flex gap-2" data-state="open" id="sample" role="region">
            <h2>Plan a
              journey</h2>
            <input placeholder="A place, a name" type="search" name="q" />
            <Button variant="outline" size="icon-lg" aria-label={saved ? "Saved" : "Save"} />
            <EmptyState message="Nothing here yet" tone="calm" />
            <p>{saved ? "Saved" : null}</p>
            <p>Mandhira</p>
            <p>{t("fine")} · 3</p>
            <p>{place.name.text}</p>
            <select>{(["relaxed", "full"] as const).map((pace) => <option key={pace}>{t(pace)}</option>)}</select>
            <Field label={t("label")} hint={tier === "fixed" ? t("a") : t("b")} />
          </section>
        );
      }`;
    const rules = scan("sample.tsx", sample).map((finding) => `${finding.rule}: ${finding.text}`);

    expect(rules).toEqual([
      "prose string: Temple",
      "prose string: Free time",
      "passed to setProblem: That didn't save.",
      "passed to setStatus: Sent.",
      "passed to setStatus: Not sent.",
      "jsx text: Plan a journey",
      "attribute placeholder: A place, a name",
      "attribute aria-label: Saved",
      "attribute aria-label: Save",
      "component prop message: Nothing here yet",
      "jsx child string: Saved",
    ]);
  });

  it("finds no hardcoded user-facing English in apps/web", () => {
    const findings = files.flatMap((file) => scan(file, readFileSync(join(appRoot, file), "utf8")));
    const offences = findings.map(
      (finding) => `${finding.file}:${finding.line} [${finding.rule}] ${finding.text.slice(0, 90)}`,
    );

    expect(
      offences,
      "Move these into apps/web/messages/*.json and render them with t(...)",
    ).toEqual([]);
  });
});
