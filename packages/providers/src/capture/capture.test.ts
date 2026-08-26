import { describe, expect, it } from "vitest";

import { detectChangeCandidates, type EvidenceRecord } from "./detect";
import { diffCaptures, formatDiff } from "./diff";
import { refuse } from "./http";
import { normaliseCapture, normaliseExcerpt } from "./normalise";

describe("normaliseCapture", () => {
  it("keeps the visible words and throws away the machinery", () => {
    const html = `
      <html><head><style>.a{color:red}</style><script>var x = "Evening aarti 18:30";</script></head>
      <body><h1>Devagiri</h1><p>Evening aarti  at   18:30</p></body></html>`;

    expect(normaliseCapture(html)).toBe("Devagiri\nEvening aarti at 18:30");
  });

  it("does not let a script's contents look like page text", () => {
    // The whole feature rests on this: a timing inside a script tag would otherwise be
    // "evidence" that changes whenever a developer edits an unrelated variable.
    expect(normaliseCapture("<script>const t = '18:30';</script><p>Closed</p>")).toBe("Closed");
  });

  it("gives block elements their own line so a list of timings stays a list", () => {
    const html = "<ul><li>Morning 06:00</li><li>Evening 18:30</li></ul>";
    expect(normaliseCapture(html)).toBe("Morning 06:00\nEvening 18:30");
  });

  it("collapses reflowed indentation, which is not a change to anything", () => {
    const before = normaliseCapture("<p>Evening aarti at 18:30</p>");
    const after = normaliseCapture("<p>\n     Evening   aarti\n     at 18:30\n   </p>");
    expect(after).toBe(before);
  });

  it("decodes the entities a timing is likely to arrive wrapped in", () => {
    expect(normaliseCapture("<p>18:30&nbsp;&ndash;&nbsp;19:15</p>")).toBe("18:30 – 19:15");
    expect(normaliseCapture("<p>Temple&#39;s hours</p>")).toBe("Temple's hours");
  });

  it("survives a malformed numeric entity rather than taking the run down", () => {
    expect(() => normaliseCapture("<p>&#999999999;ok</p>")).not.toThrow();
    expect(normaliseCapture("<p>&#999999999;ok</p>")).toBe("ok");
  });

  it("leaves plain text alone", () => {
    expect(normaliseCapture("Evening aarti at 18:30", "text/plain")).toBe("Evening aarti at 18:30");
  });

  it("flattens an excerpt the way an operator pasted it", () => {
    // Copied out of a rendered page, so it arrives with the browser's spacing rather than
    // the source's. Comparing it raw would report every excerpt as missing on run one.
    expect(normaliseExcerpt("<b>Evening  aarti</b>\n  at 18:30")).toBe("Evening aarti at 18:30");
  });
});

describe("diffCaptures", () => {
  it("says nothing changed when nothing changed", () => {
    const diff = diffCaptures("a\nb\nc", "a\nb\nc");
    expect(diff).toEqual({ lines: [], added: 0, removed: 0, identical: true });
  });

  it("reports one changed line as one removal and one addition", () => {
    const diff = diffCaptures("Morning 06:00\nEvening 18:30", "Morning 06:00\nEvening 18:00");

    expect(diff.removed).toBe(1);
    expect(diff.added).toBe(1);
    expect(diff.lines).toEqual([
      { kind: "removed", text: "Evening 18:30" },
      { kind: "added", text: "Evening 18:00" },
    ]);
  });

  it("does not report an unchanged line just because its neighbours moved", () => {
    // The point of an LCS diff rather than a line-by-line comparison: inserting a line at
    // the top must not mark every line after it as changed.
    const diff = diffCaptures("b\nc", "a\nb\nc");
    expect(diff.lines).toEqual([{ kind: "added", text: "a" }]);
  });

  it("handles an empty side in either direction", () => {
    expect(diffCaptures("", "a").lines).toEqual([{ kind: "added", text: "a" }]);
    expect(diffCaptures("a", "").lines).toEqual([{ kind: "removed", text: "a" }]);
  });

  it("still finds every change past the LCS cap", () => {
    // Past the cap the diff degrades to a set difference: the order of changes is lost,
    // every added and removed line is not. Detection reads the lines, not their order.
    const before = Array.from({ length: 5000 }, (_, i) => `line ${i}`).join("\n");
    const after = before.replace("line 4999", "line 4999 changed");

    const diff = diffCaptures(before, after);
    expect(diff.lines).toContainEqual({ kind: "removed", text: "line 4999" });
    expect(diff.lines).toContainEqual({ kind: "added", text: "line 4999 changed" });
  });

  it("formats a diff with a prefix per line and says when it truncated", () => {
    const before = Array.from({ length: 10 }, (_, i) => `old ${i}`).join("\n");
    const after = Array.from({ length: 10 }, (_, i) => `new ${i}`).join("\n");

    const text = formatDiff(diffCaptures(before, after), 4);
    expect(text.split("\n")).toHaveLength(5);
    expect(text).toContain("more changed lines");
  });
});

describe("detectChangeCandidates", () => {
  const evidence = (over: Partial<EvidenceRecord> = {}): EvidenceRecord => ({
    entityTable: "experiences",
    entityId: "e1",
    fieldName: "timing",
    excerpt: "Evening aarti at 18:30",
    ...over,
  });

  it("raises nothing on a source's first ever run", () => {
    const result = detectChangeCandidates({
      currentText: "Evening aarti at 18:30",
      previousText: null,
      evidence: [evidence()],
    });

    expect(result.changes).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it("raises a candidate when the evidence for a field disappears", () => {
    const result = detectChangeCandidates({
      currentText: "Evening aarti at 18:00",
      previousText: "Evening aarti at 18:30",
      evidence: [evidence()],
    });

    expect(result.changes).toEqual([
      {
        entityTable: "experiences",
        entityId: "e1",
        fieldName: "timing",
        excerpt: "Evening aarti at 18:30",
      },
    ]);
  });

  it("raises nothing while the evidence is still on the page", () => {
    // A source that reorganises its banner must not interrupt anybody. The whole design
    // dies of noise otherwise.
    const result = detectChangeCandidates({
      currentText: "NEW BANNER\nEvening aarti at 18:30",
      previousText: "Evening aarti at 18:30",
      evidence: [evidence()],
    });

    expect(result.changes).toEqual([]);
  });

  it("ignores case and line breaks, because neither is a change a traveler would notice", () => {
    const result = detectChangeCandidates({
      currentText: "evening\naarti at 18:30",
      previousText: "Evening aarti at 18:30",
      evidence: [evidence()],
    });

    expect(result.changes).toEqual([]);
  });

  it("skips a field whose excerpt was already absent, rather than raising it every cycle", () => {
    const result = detectChangeCandidates({
      currentText: "Something else",
      previousText: "Something else entirely",
      evidence: [evidence()],
    });

    expect(result.changes).toEqual([]);
    expect(result.skipped[0]?.reason).toBe("excerpt_absent_before");
  });

  it("reports what it could not check instead of implying full coverage", () => {
    const result = detectChangeCandidates({
      currentText: "b",
      previousText: "a",
      evidence: [
        evidence({ fieldName: null, excerpt: "whole entity" }),
        evidence({ entityId: "e2", excerpt: null }),
        evidence({ entityId: "e3", excerpt: "   " }),
      ],
    });

    expect(result.changes).toEqual([]);
    expect(result.skipped.map((s) => s.reason)).toEqual([
      "whole_entity",
      "no_excerpt",
      "no_excerpt",
    ]);
  });

  it("raises one candidate per field, not one per source line", () => {
    const result = detectChangeCandidates({
      currentText: "gone",
      previousText: "Evening aarti at 18:30\nMorning darshan at 06:00",
      evidence: [
        evidence(),
        evidence({ entityId: "e2", fieldName: "opening", excerpt: "Morning darshan at 06:00" }),
      ],
    });

    expect(result.changes).toHaveLength(2);
    expect(result.changes.map((c) => c.fieldName)).toEqual(["timing", "opening"]);
  });
});

describe("refuse — the SSRF guard", () => {
  it("allows an ordinary public URL", () => {
    expect(refuse("https://temple.example.org/timings")).toBeNull();
    expect(refuse("http://temple.example.org/timings")).toBeNull();
  });

  it.each([
    ["file:///etc/passwd", "scheme"],
    ["ftp://example.org/x", "scheme"],
    ["not a url", "URL"],
    ["https://user:pass@example.org/", "credentials"],
    ["http://localhost:5432/", "private"],
    ["http://127.0.0.1/", "private"],
    ["http://169.254.169.254/latest/meta-data/", "private"],
    ["http://10.0.0.5/", "private"],
    ["http://172.16.0.5/", "private"],
    ["http://192.168.1.1/", "private"],
    ["http://[::1]/", "private"],
    ["http://db.local/", "private"],
  ])("refuses %s", (url, because) => {
    expect(refuse(url)).toContain(because);
  });

  it("does not refuse a public address that merely looks close to a private range", () => {
    expect(refuse("http://172.32.0.1/")).toBeNull();
    expect(refuse("http://192.169.1.1/")).toBeNull();
  });
});
