import { describe, expect, it } from "vitest";

import { groundKnowledgeClaims, knowledgeClaimsSchema, type KnowledgeTarget } from "./knowledge";
import { groundTranslation } from "./translation";

const targets: KnowledgeTarget[] = [
  {
    entityTable: "places",
    entityId: "place-1",
    name: "Main temple",
    fields: ["closure_rules_i18n", "entry_requirements_i18n"],
  },
];

const captureText = `
  Temple notice.   The temple remains CLOSED on Tuesdays between 13:00 and 16:00.
  Devotees must carry government photo identity.
`;

const claim = (over: Partial<Parameters<typeof groundKnowledgeClaims>[0]["proposed"][number]>) => ({
  entityId: "place-1",
  fieldName: "closure_rules_i18n",
  value: "Closed on Tuesdays from 13:00 to 16:00",
  excerpt: "The temple remains closed on Tuesdays between 13:00 and 16:00.",
  confidence: "high" as const,
  ...over,
});

describe("knowledgeClaimsSchema", () => {
  it("accepts only the offered entities and fields", () => {
    const schema = knowledgeClaimsSchema(targets);
    expect(schema.safeParse({ claims: [claim({})] }).success).toBe(true);
    expect(schema.safeParse({ claims: [claim({ entityId: "invented" })] }).success).toBe(false);
    expect(schema.safeParse({ claims: [claim({ fieldName: "opening_schedule" })] }).success).toBe(
      false,
    );
  });

  it("stays unsatisfiable with nothing to make claims about", () => {
    expect(knowledgeClaimsSchema([]).safeParse({ claims: [claim({})] }).success).toBe(false);
  });
});

describe("groundKnowledgeClaims", () => {
  it("keeps a claim whose excerpt the source printed, ignoring case and spacing", () => {
    const { claims, rejected } = groundKnowledgeClaims({
      proposed: [claim({})],
      captureText,
      targets,
      locale: "en",
    });

    expect(rejected).toEqual([]);
    expect(claims).toEqual([
      expect.objectContaining({
        entityTable: "places",
        fieldName: "closure_rules_i18n",
        locale: "en",
      }),
    ]);
  });

  it("rejects each way a claim can fail to trace back to the capture", () => {
    const { claims, rejected } = groundKnowledgeClaims({
      proposed: [
        claim({ entityId: "place-9" }),
        claim({ fieldName: "dress_code_i18n" }),
        claim({ excerpt: "The temple is closed every Monday." }),
        // The right sentence, reporting a different time.
        claim({ value: "Closed on Tuesdays from 12:00 to 16:00" }),
      ],
      captureText,
      targets,
      locale: "en",
    });

    expect(claims).toEqual([]);
    expect(rejected.map((r) => r.reason)).toEqual([
      "unknown_target",
      "unknown_field",
      "excerpt_not_in_source",
      "value_not_in_excerpt",
    ]);
  });
});

describe("groundTranslation", () => {
  it("accepts a translation that carries only the source's own times", () => {
    expect(
      groundTranslation(" मंगलवार को 13:00 से 16:00 तक बंद ", "Closed 13:00–16:00 on Tuesday"),
    ).toEqual({
      text: "मंगलवार को 13:00 से 16:00 तक बंद",
      offending: [],
    });
  });

  it("refuses a translation that introduces a time the source never said", () => {
    const result = groundTranslation("मंगलवार को 14:00 से बंद", "Closed on Tuesday afternoons");
    expect(result.text).toBeNull();
    expect(result.offending).toHaveLength(1);
  });
});
