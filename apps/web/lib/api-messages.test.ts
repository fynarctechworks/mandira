import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import hi from "../messages/hi.json";
import te from "../messages/te.json";
import { API_MESSAGE_KEYS, localeOfRequest, translateApiMessage } from "./api-messages";

const APP = join(__dirname, "..");

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!["node_modules", ".next", ".next-e2e"].includes(entry.name)) sources(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const request = (headers: Record<string, string>) =>
  new Request("https://mandhira.test/api/journeys", { headers });

describe("API messages", () => {
  it("has a catalog key for every sentence a traveler route refuses with", () => {
    const missing: string[] = [];
    const literal = /new ApiError\(\s*"[a-z_]+"\s*,\s*"((?:[^"\\]|\\.)*)"/g;

    for (const file of [...sources(join(APP, "app/api")), ...sources(join(APP, "lib"))]) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(literal)) {
        const message = JSON.parse(`"${match[1]}"`) as string;
        if (!(message in API_MESSAGE_KEYS)) missing.push(`${relative(APP, file)}: ${message}`);
      }
    }

    expect(missing).toEqual([]);
  });

  it("has every key in Telugu and Hindi", () => {
    const keys = [...new Set([...Object.values(API_MESSAGE_KEYS), "journey_max_days"])];
    const api = (catalog: unknown) => (catalog as { api?: Record<string, string> }).api ?? {};

    expect(keys.filter((key) => !api(te)[key])).toEqual([]);
    expect(keys.filter((key) => !api(hi)[key])).toEqual([]);
  });

  it("answers in the language of the page that asked", () => {
    const telugu = request({ referer: "https://mandhira.test/te/journeys/abc" });
    const message = "This journey doesn't have that day.";

    expect(translateApiMessage(message, telugu)).toBe(
      (te as unknown as { api: Record<string, string> }).api.no_such_day,
    );
    expect(translateApiMessage(message, request({}))).toBe(message);
  });

  it("fills in the value for a sentence built with one", () => {
    const hindi = request({ cookie: "NEXT_LOCALE=hi" });
    expect(translateApiMessage("A journey can be up to 14 days.", hindi)).toContain("14");
    expect(translateApiMessage("A journey can be up to 14 days.", hindi)).not.toContain("journey");
  });

  it("leaves an uncatalogued sentence as it is rather than blanking it", () => {
    const telugu = request({ referer: "https://mandhira.test/te/" });
    expect(translateApiMessage("Something new.", telugu)).toBe("Something new.");
  });

  it("reads the page before the cookie, and falls back to English", () => {
    expect(
      localeOfRequest(
        request({ referer: "https://mandhira.test/hi/plan", cookie: "NEXT_LOCALE=te" }),
      ),
    ).toBe("hi");
    expect(localeOfRequest(request({ cookie: "NEXT_LOCALE=te" }))).toBe("te");
    expect(localeOfRequest(request({ referer: "https://mandhira.test/api/x" }))).toBe("en");
  });
});
