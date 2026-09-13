import { describe, expect, it } from "vitest";
import {
  PHRASE_CONTEXT_VALUES,
  contextLabel,
  emptyPhrase,
  joinTranslations,
  splitTranslations,
} from "./phrase-draft";

describe("phrase contexts", () => {
  it("are exactly the TRD §4.4 check-constraint values", () => {
    expect([...PHRASE_CONTEXT_VALUES].sort()).toEqual(
      ["dietary", "directions", "facilities", "greeting", "help", "medical", "queue"].sort(),
    );
  });

  it("label known contexts and pass unknown ones through", () => {
    expect(contextLabel("queue")).toBe("In a queue");
    expect(contextLabel("something_else")).toBe("something_else");
  });
});

describe("emptyPhrase", () => {
  it("starts as a universal English phrase when no destination is given", () => {
    const draft = emptyPhrase(null);
    expect(draft.destination_id).toBeNull();
    expect(draft.source_locale).toBe("en");
    expect(draft.text_i18n).toEqual({});
  });
});

describe("splitTranslations", () => {
  it("separates the phrase from how to say it", () => {
    expect(
      splitTranslations({
        te: { text: "తూర్పు ద్వారం ఎక్కడ ఉంది?", transliteration: "turpu dvaram ekkada undi?" },
        hi: { text: "पूर्वी द्वार कहाँ है?" },
      }),
    ).toEqual({
      text_i18n: { te: "తూర్పు ద్వారం ఎక్కడ ఉంది?", hi: "पूर्वी द्वार कहाँ है?" },
      transliteration_i18n: { te: "turpu dvaram ekkada undi?" },
    });
  });

  it("opens a malformed value as untranslated rather than crashing", () => {
    for (const value of [null, "text", [], { te: "not an object" }, { te: { text: 3 } }]) {
      expect(splitTranslations(value)).toEqual({ text_i18n: {}, transliteration_i18n: {} });
    }
  });
});

describe("joinTranslations", () => {
  it("round-trips what splitTranslations reads", () => {
    const stored = {
      hi: { text: "मुझे डॉक्टर चाहिए।", transliteration: "mujhe doctor chahiye." },
      te: { text: "నాకు డాక్టర్ కావాలి." },
    };
    const { text_i18n, transliteration_i18n } = splitTranslations(stored);
    expect(joinTranslations(text_i18n, transliteration_i18n, "en")).toEqual(stored);
  });

  it("leaves out the source locale, which is source_text's job", () => {
    expect(joinTranslations({ en: "Help", te: "సహాయం" }, {}, "en")).toEqual({
      te: { text: "సహాయం" },
    });
  });

  it("keeps a transliteration with no phrase so validation can name what is missing", () => {
    expect(joinTranslations({}, { te: "sahayam" }, "en")).toEqual({
      te: { text: "", transliteration: "sahayam" },
    });
  });

  it("drops locales where both halves are blank", () => {
    expect(joinTranslations({ te: "  " }, { te: "" }, "en")).toEqual({});
  });
});
