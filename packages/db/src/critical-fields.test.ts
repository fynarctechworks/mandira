import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CRITICAL_FIELDS } from "./critical-fields";

/**
 * The critical-field list exists twice by necessity: in SQL, where it gates the published
 * views, and in TypeScript, where the trust panel renders it. This reads the migration and
 * asserts they agree.
 *
 * Without it, adding a critical field to the views would leave the UI offering no way to
 * verify it — or worse, removing one from the views would silently un-gate a field while
 * the UI still claimed it was protected.
 */
const migration = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../supabase/migrations/0007_published_views.sql",
  ),
  "utf8",
);

/** Pulls the field list out of a `critical_fields_gated('<table>', id, array[...])` call. */
function gatedFields(table: string): string[] {
  const call = new RegExp(
    String.raw`critical_fields_gated\(\s*'${table}',[^,]+,\s*array\[([^\]]*)\]`,
    "s",
  ).exec(migration);
  if (!call?.[1]) return [];
  return [...call[1].matchAll(/'([^']+)'/g)].map((m) => m[1]!);
}

describe("critical fields match the published-view gate", () => {
  it.each(["places", "experiences", "transport_connections"] as const)(
    "%s gates exactly the fields the UI lists",
    (table) => {
      const inSql = gatedFields(table).sort();
      const inCode = CRITICAL_FIELDS[table]
        .map((f) => f.field)
        .filter((f): f is string => f !== null)
        .sort();

      expect(inSql, `${table} appears in the migration`).not.toHaveLength(0);
      expect(inCode).toEqual(inSql);
    },
  );

  it("treats availability rules as whole-entity trust, matching the view", () => {
    // The availability view checks `field_name is null` rather than a field list.
    expect(migration).toMatch(/entity_table = 'availability_rules'[\s\S]*?field_name is null/);
    expect(CRITICAL_FIELDS.availability_rules.map((f) => f.field)).toEqual([null]);
  });

  it("gives every critical field a reason a traveler would recognise", () => {
    for (const fields of Object.values(CRITICAL_FIELDS)) {
      for (const field of fields) {
        expect(field.label.length).toBeGreaterThan(0);
        expect(field.why.length).toBeGreaterThan(20);
      }
    }
  });
});
