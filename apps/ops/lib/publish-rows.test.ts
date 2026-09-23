import { describe, expect, it } from "vitest";
import { blockedReason, candidateLabel } from "./publish-rows";

describe("candidateLabel", () => {
  it("names the four slugged tables by name, falling back to slug", () => {
    expect(
      candidateLabel("places", { id: "1", slug: "ghat", name_i18n: { en: "Dashashwamedh" } }),
    ).toBe("Dashashwamedh");
    expect(candidateLabel("routes", { id: "1", slug: "parikrama", name_i18n: {} })).toBe(
      "parikrama",
    );
  });

  it("describes a transport leg by mode and its two ends", () => {
    const places = new Map([
      ["a", "Station"],
      ["b", "Temple"],
    ]);
    expect(
      candidateLabel(
        "transport_connections",
        {
          id: "1",
          mode: "public_transport",
          operator: "UPSRTC",
          from_place_id: "a",
          to_place_id: "b",
        },
        places,
      ),
    ).toBe("UPSRTC public transport from Station to Temple");
  });

  it("describes guidance by kind and the start of its body", () => {
    const long =
      "Carry a shawl for the early aarti because the ghats are cold before sunrise in winter";
    const label = candidateLabel("guidance_blocks", {
      id: "1",
      guidance_type: "what_to_carry",
      body_i18n: { en: long },
    });
    // Sentence case at the start of a label, like everywhere else (design review).
    expect(label.startsWith("What to carry: Carry a shawl")).toBe(true);
    expect(label.endsWith("…")).toBe(true);
  });

  it("names phrases and advisories without a blank", () => {
    expect(candidateLabel("phrases", { id: "p", source_text: "Where is the queue?" })).toBe(
      "Where is the queue?",
    );
    expect(candidateLabel("advisories", { id: "a", title_i18n: {} })).toBe("Untitled advisory");
  });
});

describe("blockedReason", () => {
  it("turns the job's recorded reason into a sentence", () => {
    expect(blockedReason({ sqlstate: "23514", reason: "Not ready to publish" })).toMatch(
      /validation/,
    );
    expect(blockedReason({ reason: "Separation of duties" })).toMatch(/different approver/);
    expect(blockedReason({ reason: "Publishing needs the approver role" })).toMatch(
      /approver role/,
    );
  });

  it("never renders nothing", () => {
    expect(blockedReason(null)).toMatch(/could not be published/);
  });
});
