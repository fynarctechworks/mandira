import { describe, expect, it } from "vitest";
import {
  dateForDay,
  fromInstant,
  spillsPastMidnight,
  toInstant,
  toMinutes,
  toTimeOfDay,
  weekdayOf,
} from "./time";

describe("time of day", () => {
  it("converts to and from minutes", () => {
    expect(toMinutes("00:00")).toBe(0);
    expect(toMinutes("06:30")).toBe(390);
    expect(toMinutes("23:59")).toBe(1439);
    expect(toTimeOfDay(390)).toBe("06:30");
    expect(toTimeOfDay(0)).toBe("00:00");
  });

  it("refuses malformed input rather than guessing", () => {
    // A silently-misread time becomes a missed darshan slot.
    for (const bad of ["6:30", "24:00", "06:60", "0630", "", "6.30"]) {
      expect(() => toMinutes(bad), bad).toThrow();
    }
  });

  it("wraps past midnight and can report that it did", () => {
    expect(toTimeOfDay(1440 + 30)).toBe("00:30");
    expect(spillsPastMidnight(1470)).toBe(true);
    expect(spillsPastMidnight(1439)).toBe(false);
  });
});

describe("dates", () => {
  it("adds days without shifting across a local midnight", () => {
    // UTC arithmetic on purpose: local Date would shift the day west of Greenwich.
    expect(dateForDay("2026-10-12", 0)).toBe("2026-10-12");
    expect(dateForDay("2026-10-12", 3)).toBe("2026-10-15");
  });

  it("crosses month and year boundaries", () => {
    expect(dateForDay("2026-10-30", 3)).toBe("2026-11-02");
    expect(dateForDay("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("knows the weekday", () => {
    expect(weekdayOf("2026-10-12")).toBe("mon");
    expect(weekdayOf("2026-10-17")).toBe("sat");
    expect(weekdayOf("2026-10-18")).toBe("sun");
  });
});

describe("instants", () => {
  const TZ = "Asia/Kolkata";

  it("writes the LOCAL wall time with its offset", () => {
    // Writing the UTC wall time with a local offset denotes a different moment entirely —
    // the two disagree by exactly the offset, which is how a 06:00 start became 00:30.
    expect(toInstant("2026-10-12", 6 * 60, TZ)).toBe("2026-10-12T06:00:00+05:30");
  });

  it("round-trips through local minutes", () => {
    for (const minutes of [0, 390, 1080, 1439]) {
      const iso = toInstant("2026-10-12", minutes, TZ);
      expect(fromInstant(iso, "2026-10-12", TZ)).toBe(minutes);
    }
  });

  it("rolls into the next day when minutes run past midnight", () => {
    const iso = toInstant("2026-10-12", 1440 + 30, TZ);
    expect(iso).toBe("2026-10-13T00:30:00+05:30");
    // Still expressed relative to the requested day, so it stays comparable.
    expect(fromInstant(iso, "2026-10-12", TZ)).toBe(1470);
  });

  it("handles a timezone that observes DST on both sides of the change", () => {
    // Europe/London moves to GMT on 2026-10-25. The offset must follow the date, not the
    // machine or the journey's start.
    expect(toInstant("2026-10-24", 12 * 60, "Europe/London")).toBe("2026-10-24T12:00:00+01:00");
    expect(toInstant("2026-10-26", 12 * 60, "Europe/London")).toBe("2026-10-26T12:00:00+00:00");
  });

  it("round-trips across a DST boundary", () => {
    for (const date of ["2026-10-24", "2026-10-26"]) {
      const iso = toInstant(date, 9 * 60, "Europe/London");
      expect(fromInstant(iso, date, "Europe/London")).toBe(9 * 60);
    }
  });

  it("reads an instant expressed in a different offset correctly", () => {
    // 03:30Z is 09:00 in Kolkata; the engine must agree regardless of how it was written.
    expect(fromInstant("2026-10-12T03:30:00Z", "2026-10-12", TZ)).toBe(9 * 60);
  });

  it("rejects an unparseable instant", () => {
    expect(() => fromInstant("not-a-time", "2026-10-12", TZ)).toThrow();
  });
});
