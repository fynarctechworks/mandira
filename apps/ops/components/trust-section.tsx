import { criticalFieldsFor } from "@mandhira/db";
import { TrustPanel, type TrustRecord } from "./trust-panel";

/**
 * The trust block shown on an entity's edit page.
 *
 * Leads with how many critical fields still block publication, because that is the number
 * an operator actually needs: an entity can look finished and still be invisible to every
 * traveler (D-030).
 */
export function TrustSection({
  entityTable,
  entityId,
  sources,
  records,
}: {
  entityTable: string;
  entityId: string;
  sources: { id: string; label: string; tier: string }[];
  records: Record<string, TrustRecord | undefined>;
}) {
  const fields = criticalFieldsFor(entityTable);
  if (fields.length === 0) return null;

  const gating = fields.filter((field) => {
    const status = records[field.field ?? "entity"]?.verification_status;
    return status !== "human_reviewed" && status !== "verified" && status !== "disputed";
  });

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-h3">Trust</h2>
        {sources.length === 0 ? (
          <p className="mt-1 text-body-sm text-status-tight">
            No sources are registered yet, so nothing here can be verified. Register one first.
          </p>
        ) : gating.length === 0 ? (
          <p className="mt-1 text-body-sm text-status-comfortable">
            ● Every critical field is reviewed. This can be published.
          </p>
        ) : (
          <p className="mt-1 text-body-sm text-text-secondary">
            {gating.length} of {fields.length} critical fields still block publication. Travelers
            see nothing until each is reviewed against a source.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {fields.map((field) => (
          <TrustPanel
            key={field.field ?? "entity"}
            entityTable={entityTable}
            entityId={entityId}
            field={field}
            sources={sources}
            record={records[field.field ?? "entity"]}
          />
        ))}
      </div>
    </section>
  );
}
