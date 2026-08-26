import { describe, expect, it } from "vitest";
import { ANALYTICS_EVENTS, analyticsEventSchema, toAnalyticsRow } from "./analytics";

/**
 * PRD-ANLY-001's acceptance is "zero user identifiers". These are the tests that keep it
 * true as the event list grows — an allowlist is only a control while something checks that
 * nothing walks around it.
 */
const SESSION = "device-abcdef0123456789extra";

describe("the analytics allowlist", () => {
  it("accepts an event it knows", () => {
    const row = toAnalyticsRow(
      { name: "journey_saved", properties: { day_count: 3, item_count: 7 } },
      SESSION,
    );

    expect(row?.event_name).toBe("journey_saved");
    expect(row?.properties).toEqual({ day_count: 3, item_count: 7 });
  });

  it("refuses an event it does not know", () => {
    // Either a bug or someone probing. Neither should write a row.
    expect(toAnalyticsRow({ name: "user_email_captured" }, SESSION)).toBeNull();
  });

  it("DROPS a property the event does not declare", () => {
    /*
     * The heart of it. An allowlist rather than a ban list, because a ban list only stops
     * what someone thought to forbid — and the field that leaks is always the one nobody
     * thought about.
     */
    const row = toAnalyticsRow(
      {
        name: "journey_saved",
        properties: {
          day_count: 3,
          email: "amma@example.com",
          traveler_name: "amma",
          search_term: "temple",
        } as Record<string, string | number | boolean>,
      },
      SESSION,
    );

    expect(row?.properties).toEqual({ day_count: 3 });
    expect(JSON.stringify(row)).not.toMatch(/amma|example\.com|temple/);
  });

  it("keeps unknown properties out even when every property is unknown", () => {
    const row = toAnalyticsRow(
      { name: "share_created", properties: { recipient: "someone" } },
      SESSION,
    );

    // `share_created` declares none, so the row carries none.
    expect(row?.properties).toEqual({});
  });

  it("truncates the session id, so it groups a visit and does not follow a person", () => {
    // Enough to join one visit's events; not a durable identifier across weeks. That is
    // the line between measuring a funnel and tracking somebody (PRD §10, DPDP).
    expect(toAnalyticsRow({ name: "live_opened" }, SESSION)?.anon_session_id).toHaveLength(16);
  });

  it("carries no session id at all when there is none", () => {
    expect(toAnalyticsRow({ name: "live_opened" }, null)?.anon_session_id).toBeNull();
  });

  it("has no user field to write an identifier into", () => {
    const row = toAnalyticsRow({ name: "live_opened" }, SESSION)!;

    // The structural half of the promise: `analytics_events` has no user column (TRD §4.7),
    // and nothing here invents one.
    expect(Object.keys(row)).not.toContain("user_id");
    expect(Object.keys(row)).not.toContain("owner_user_id");
    expect(Object.keys(row)).not.toContain("email");
  });
});

describe("the event schema", () => {
  it("refuses free text as a property value", () => {
    /*
     * The reason property values must look like categories: without it, "search_term"
     * arrives as a property and with it the name of a temple somebody was quietly looking
     * for at 2am.
     */
    const result = analyticsEventSchema.safeParse({
      name: "search_performed",
      properties: { locale: "Where is the Hill Temple?" },
    });

    expect(result.success).toBe(false);
  });

  it("accepts categories, counts and flags", () => {
    const result = analyticsEventSchema.safeParse({
      name: "item_action",
      properties: { action: "retier", tier: "protected", is_confirmed: true },
    });

    expect(result.success).toBe(true);
  });

  it("refuses a journey id that is not a uuid", () => {
    expect(
      analyticsEventSchema.safeParse({ name: "live_opened", journeyId: "../../etc/passwd" })
        .success,
    ).toBe(false);
  });
});

describe("the event list itself", () => {
  it("names no property that could identify a person", () => {
    /*
     * A guard on the LIST, not on one event. The allowlist is the control, so the risk
     * moves to somebody adding a plausible-sounding property to it in a hurry.
     */
    const suspicious = /email|name|phone|address|ip|user|token|term|query|text|note/i;

    const offences = Object.entries(ANALYTICS_EVENTS).flatMap(([event, properties]) =>
      properties.filter((p) => suspicious.test(p)).map((p) => `${event}.${p}`),
    );

    expect(offences).toEqual([]);
  });

  it("declares only counts, categories and flags by naming convention", () => {
    const wellNamed =
      /_count$|_minutes$|^is_|^locale$|^action$|^tier$|^group$|_state$|_kind$|^platform$|^entry_point$/;

    const offences = Object.entries(ANALYTICS_EVENTS).flatMap(([event, properties]) =>
      properties.filter((p) => !wellNamed.test(p)).map((p) => `${event}.${p}`),
    );

    expect(offences).toEqual([]);
  });
});
