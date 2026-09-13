import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createTranslator, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "../messages/en.json";
import { engineText, type Translate } from "./engine-text";

const ENGINE_SRC = join(process.cwd(), "packages/journey-engine/src");

const engineSource = readdirSync(ENGINE_SRC)
  .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
  .map((file) => readFileSync(join(ENGINE_SRC, file), "utf8"))
  .join("\n");

function lookup(messages: unknown, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined,
      messages,
    );
}

/** `change.what.<kind>` is built from the trigger vocabulary, so it never appears as a literal. */
function triggerKinds(): string[] {
  const union = /export type ChangeTriggerKind =([^;]+);/.exec(engineSource)?.[1] ?? "";
  return [...union.matchAll(/"([a-z_]+)"/g)].map((match) => match[1]!);
}

describe("engine message catalog", () => {
  const emitted = new Set([
    ...[...engineSource.matchAll(/"((?:health|change|plan)\.[a-z_]+\.[a-z_]+)"/g)].map(
      (match) => match[1]!,
    ),
    ...triggerKinds().map((kind) => `change.what.${kind}`),
  ]);

  it("finds the engine's keys at all", () => {
    expect(emitted.size).toBeGreaterThan(30);
    expect(triggerKinds()).toContain("user_late");
  });

  it.each([...emitted])("has English for %s", (key) => {
    expect(typeof lookup(en, key)).toBe("string");
  });
});

describe("engineText", () => {
  // Untyped messages, as the app uses them: keys arrive from the engine as plain strings.
  const t = createTranslator({
    locale: "en",
    messages: en as AbstractIntlMessages,
  }) as unknown as Translate;

  it("renders a key with its parameters", () => {
    expect(engineText(t, "change.what.user_late", { minutes: 25 })).toBe(
      "You're about 25 minutes behind.",
    );
  });

  it("pluralises trust counts", () => {
    expect(engineText(t, "health.trust.unverified", { count: 1 })).toBe(
      "1 detail here hasn't been verified recently.",
    );
    expect(engineText(t, "health.trust.unverified", { count: 3 })).toBe(
      "3 details here haven't been verified recently.",
    );
  });

  it("fills a parameter the engine did not send instead of failing to format", () => {
    expect(engineText(t, "change.option.remove_optional")).toBe("Leave out ");
  });

  it("renders an unknown key as nothing, never as the key", () => {
    expect(engineText(t, "health.cause.not_a_real_cause", { minutes: 5 })).toBe("");
  });
});
