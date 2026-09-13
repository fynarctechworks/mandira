import { describe, expect, it } from "vitest";

import { DataUnavailableError, mustList, mustMaybe, mustWrite } from "./data-error";

const outage = { code: "08006", message: "connection terminated" };

describe("mustList", () => {
  it("returns the rows of a successful query", () => {
    expect(mustList({ data: [{ id: "a" }], error: null }, "t")).toEqual([{ id: "a" }]);
  });

  it("returns [] for a successful query with no rows", () => {
    expect(mustList({ data: [], error: null }, "t")).toEqual([]);
    expect(mustList({ data: null, error: null }, "t")).toEqual([]);
  });

  it("throws instead of pretending a failed query found nothing", () => {
    expect(() => mustList({ data: null, error: outage }, "journeys")).toThrow(DataUnavailableError);
  });
});

describe("mustMaybe", () => {
  it("returns the row, or null when the query succeeded with none", () => {
    expect(mustMaybe({ data: { id: "a" }, error: null }, "t")).toEqual({ id: "a" });
    expect(mustMaybe({ data: null, error: null }, "t")).toBeNull();
  });

  it("throws when the query did not complete", () => {
    expect(() => mustMaybe({ data: null, error: outage }, "t")).toThrow(DataUnavailableError);
  });
});

describe("mustWrite", () => {
  it("passes a write that landed and throws on one that did not", () => {
    expect(() => mustWrite({ error: null }, "t")).not.toThrow();
    expect(() => mustWrite({ error: outage }, "t")).toThrow(DataUnavailableError);
  });
});

describe("DataUnavailableError", () => {
  it("carries the source and the Supabase code and message for server logs", () => {
    const thrown = (() => {
      try {
        mustWrite({ error: outage }, "journey_items update");
      } catch (caught) {
        return caught;
      }
      return null;
    })();

    expect(thrown).toBeInstanceOf(DataUnavailableError);
    const cause = thrown as DataUnavailableError;
    expect(cause.name).toBe("DataUnavailableError");
    expect(cause.source).toBe("journey_items update");
    expect(cause.code).toBe("08006");
    expect(cause.detail).toBe("connection terminated");
    expect(cause.message).toContain("journey_items update");
  });
});
