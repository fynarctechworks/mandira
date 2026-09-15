import { describe, expect, it } from "vitest";
import {
  fieldLabel,
  fieldState,
  isCriticalField,
  isTranslatableTable,
  type TranslationRecord,
} from "./content-translations";

const record = (status: string, source_text: string): TranslationRecord => ({
  field_name: "name_i18n",
  locale: "te",
  status,
  source_text,
  updated_at: "2026-09-15T00:00:00Z",
});

describe("fieldState", () => {
  it("has nothing to translate without English", () => {
    expect(fieldState(undefined, "గుడి", undefined)).toBe("no_english");
    expect(fieldState("  ", undefined, record("confirmed", ""))).toBe("no_english");
  });

  it("is missing when nothing is written", () => {
    expect(fieldState("Temple", undefined, undefined)).toBe("missing");
    expect(fieldState("Temple", " ", undefined)).toBe("missing");
  });

  it("calls text typed in the editor, never reviewed, unreviewed", () => {
    expect(fieldState("Temple", "గుడి", undefined)).toBe("unreviewed");
  });

  it("reports the recorded status while the English still matches", () => {
    expect(fieldState("Temple", "గుడి", record("confirmed", "Temple"))).toBe("confirmed");
    expect(fieldState("Temple", "గుడి", record("draft", "Temple"))).toBe("draft");
    expect(fieldState("Temple", "గుడి", record("ai_draft", "Temple"))).toBe("ai_draft");
  });

  it("says the English changed, even over a confirmation", () => {
    expect(fieldState("Old temple", "గుడి", record("confirmed", "Temple"))).toBe("english_changed");
  });
});

describe("field names", () => {
  it("names known fields and humanises the rest", () => {
    expect(fieldLabel("entry_requirements_i18n")).toBe("Entry requirements");
    expect(fieldLabel("elevation_note_i18n")).toBe("Elevation note");
  });

  it("marks the critical fields", () => {
    expect(isCriticalField("advance_booking_how_i18n")).toBe(true);
    expect(isCriticalField("dress_code_i18n")).toBe(false);
  });

  it("accepts only the translatable tables", () => {
    expect(isTranslatableTable("places")).toBe(true);
    expect(isTranslatableTable("sources")).toBe(false);
  });
});
