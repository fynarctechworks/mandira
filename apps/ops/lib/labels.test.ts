import { describe, expect, it } from "vitest";

import { humanLabel, inSentence, looksLikeStoredValue } from "./labels";

describe("humanLabel", () => {
  it("cases a plain value instead of showing it raw", () => {
    expect(humanLabel("temple")).toBe("Temple");
    expect(humanLabel("walk")).toBe("Walk");
  });

  it("says the jargon ones in words", () => {
    expect(humanLabel("in_review")).toBe("In review");
    expect(humanLabel("human_reviewed")).toBe("Reviewed by a person");
    expect(humanLabel("url_monitor")).toBe("Watches a web page");
  });

  it("reads the same everywhere, whatever the screen", () => {
    // The finding was one state cased two ways on two screens.
    expect(humanLabel("in_review")).toBe(humanLabel("in_review"));
    expect(humanLabel("official_authority")).toBe("Official authority");
  });

  it("is empty for nothing, not 'undefined'", () => {
    expect(humanLabel(null)).toBe("");
    expect(humanLabel(undefined)).toBe("");
  });
});

describe("inSentence", () => {
  it("is lowercase in the middle of a phrase", () => {
    expect(`UPSRTC ${inSentence("public_transport")} from the station`).toBe(
      "UPSRTC public transport from the station",
    );
  });

  it("keeps an initialism's capitals wherever it lands", () => {
    expect(inSentence("ai_draft")).toBe("AI draft");
  });
});

describe("looksLikeStoredValue", () => {
  it("recognises an enum value", () => {
    expect(looksLikeStoredValue("in_review")).toBe(true);
    expect(looksLikeStoredValue("temple")).toBe(true);
  });

  it("leaves what an operator wrote alone", () => {
    // Free text must be shown exactly as written, never "corrected".
    expect(looksLikeStoredValue("Hill Temple")).toBe(false);
    expect(looksLikeStoredValue("Open 06:00 to 12:00")).toBe(false);
    expect(looksLikeStoredValue("north-gate")).toBe(false);
  });
});
