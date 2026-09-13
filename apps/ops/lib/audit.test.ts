import { describe, expect, it } from "vitest";
import {
  auditQuery,
  changedKeys,
  dayRange,
  displayValue,
  isVersionedTable,
  parseAuditFilters,
  versionDiff,
} from "./audit";

describe("parseAuditFilters", () => {
  it("keeps recognised filters", () => {
    expect(
      parseAuditFilters({
        table: "places",
        action: "publish",
        actor: "0c9d2a40-6a3b-4d8e-9f11-2b3c4d5e6f70",
        from: "2026-09-01",
        to: "2026-09-13",
        page: "3",
      }),
    ).toEqual({
      table: "places",
      action: "publish",
      actor: "0c9d2a40-6a3b-4d8e-9f11-2b3c4d5e6f70",
      from: "2026-09-01",
      to: "2026-09-13",
      page: 3,
    });
  });

  it("drops anything that could reach the query unchecked", () => {
    expect(
      parseAuditFilters({
        table: "traveler_data; drop",
        action: "truncate",
        actor: "not-a-uuid",
        from: "yesterday",
        page: "-2",
      }),
    ).toEqual({ table: null, action: null, actor: null, from: null, to: null, page: 1 });
  });
});

describe("dayRange", () => {
  it("covers the whole of the last day, in India time", () => {
    expect(dayRange({ from: "2026-09-01", to: "2026-09-30" })).toEqual({
      gte: "2026-09-01T00:00:00+05:30",
      lt: "2026-10-01T00:00:00+05:30",
    });
    expect(dayRange({ from: null, to: null })).toEqual({ gte: null, lt: null });
  });
});

describe("auditQuery", () => {
  it("keeps the filters when paging, and omits page 1", () => {
    const filters = parseAuditFilters({ table: "places", action: "update" });
    expect(auditQuery(filters, 1)).toBe("?table=places&action=update");
    expect(auditQuery(filters, 2)).toBe("?table=places&action=update&page=2");
    expect(auditQuery(parseAuditFilters({}), 1)).toBe("");
  });
});

describe("changedKeys", () => {
  it("finds changed, added and removed keys, ignoring timestamps", () => {
    expect(
      changedKeys(
        { name_i18n: { en: "A" }, status: "draft", updated_at: "1", gone: 1 },
        { name_i18n: { en: "B" }, status: "draft", updated_at: "2", added: true },
      ),
    ).toEqual(["added", "gone", "name_i18n"]);
  });

  it("treats a missing body as empty", () => {
    expect(changedKeys(null, { status: "draft" })).toEqual(["status"]);
  });
});

describe("versionDiff", () => {
  it("prefers the fields the trigger recorded", () => {
    expect(
      versionDiff({ status: "draft", slug: "a" }, { status: "in_review", slug: "b" }, ["status"]),
    ).toEqual([{ field: "status", before: "draft", after: "in_review" }]);
  });

  it("falls back to comparing the snapshots", () => {
    expect(versionDiff(undefined, { slug: "kashi" })).toEqual([
      { field: "slug", before: "—", after: "kashi" },
    ]);
  });
});

describe("displayValue", () => {
  it("renders every value visibly", () => {
    expect(displayValue(null)).toBe("—");
    expect(displayValue("")).toBe("(empty)");
    expect(displayValue(false)).toBe("false");
    expect(displayValue({ en: "Kashi" })).toContain('"en": "Kashi"');
  });
});

describe("isVersionedTable", () => {
  it("accepts only tables with recorded versions", () => {
    expect(isVersionedTable("advisories")).toBe(true);
    expect(isVersionedTable("user_roles")).toBe(false);
  });
});
