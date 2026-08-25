import { describe, expect, it } from "vitest";
import { mapsHref } from "./open-in-maps";

/** The fixture Hill Temple, and a label with a space and a bracket in it. */
const LAT = 17.386;
const LNG = 78.478;
const LABEL = "Hill Temple (fixture)";

describe("the Open-in-Maps hand-off (MAPS-03)", () => {
  it("puts latitude before longitude on every platform", () => {
    // The trap. `location` is stored as PostGIS geography where ST_X is LONGITUDE and
    // ST_Y is latitude — x/y, not the order people say out loud. Swapped, 17.386,78.478
    // becomes 78.478,17.386: a confident pin in western China, rendered without complaint.
    for (const platform of ["apple", "android", "other"] as const) {
      expect(mapsHref(platform, LAT, LNG, LABEL)).toContain("17.386,78.478");
      expect(mapsHref(platform, LAT, LNG, LABEL)).not.toContain("78.478,17.386");
    }
  });

  it("hands Android a geo: URI so the traveler's own maps app answers", () => {
    const href = mapsHref("android", LAT, LNG, LABEL);

    // Not a Google Maps URL: someone who installed OsmAnd for offline pilgrimage routes
    // should not be dragged into a different app by us.
    expect(href.startsWith("geo:")).toBe(true);
    expect(href).not.toContain("google.com");
  });

  it("repeats the coordinates inside Android's q so the label is not searched", () => {
    // `geo:lat,lng?q=Label` makes some apps treat the label as free text and wander off to
    // a similarly named temple in another state. The coordinates inside `q` anchor it.
    const href = mapsHref("android", LAT, LNG, LABEL);
    expect(href).toMatch(/^geo:17\.386,78\.478\?q=17\.386,78\.478\(/);
  });

  it("uses the web host for Apple, so the link still works off an Apple device", () => {
    const href = mapsHref("apple", LAT, LNG, LABEL);

    // `maps://` is refused by Android and by desktop browsers. `maps.apple.com` opens the
    // app on an Apple device and the web map everywhere else — a shared link that works.
    expect(href.startsWith("https://maps.apple.com/")).toBe(true);
  });

  it("falls back to Google Maps over https, which any browser can open", () => {
    expect(mapsHref("other", LAT, LNG, LABEL).startsWith("https://www.google.com/maps/")).toBe(
      true,
    );
  });

  it("escapes the label rather than letting it break the URL", () => {
    for (const platform of ["apple", "android"] as const) {
      const href = mapsHref(platform, LAT, LNG, LABEL);
      expect(href).toContain("Hill%20Temple");
      // A raw space would truncate the link in some clients, dropping the name.
      expect(href).not.toContain("Hill Temple");
    }
  });

  it("carries the name, so the destination arrives labelled", () => {
    // A bare pin is hard to hold on to while walking; "Hill Temple" is not.
    expect(mapsHref("apple", LAT, LNG, LABEL)).toContain("Hill%20Temple");
    expect(mapsHref("android", LAT, LNG, LABEL)).toContain("Hill%20Temple");
  });

  it("survives a southern or western coordinate without losing the sign", () => {
    const href = mapsHref("other", -33.8688, -151.2093, "Somewhere");
    expect(href).toContain("-33.8688,-151.2093");
  });
});
