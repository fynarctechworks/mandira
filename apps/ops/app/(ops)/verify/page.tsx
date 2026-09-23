import { Button } from "@mandhira/ui/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@mandhira/ui/components/ui/native-select";
import { LoadProblem } from "@/components/load-problem";
import { VerifyQueue } from "@/components/verify-queue";
import { opsSupabase } from "@/lib/supabase";
import { loadVerifyQueue } from "@/lib/verify-queue";
import { filterVerifyRows, type VerifyFilter } from "@/lib/verify-rows";
import { Filter, ShieldCheck } from "lucide-react";
import { QueueEmpty } from "@/components/queue-empty";

export const metadata = { title: "Verify queue · Mandhira Ops" };
export const dynamic = "force-dynamic";

const FILTERS: { value: VerifyFilter; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "mine", label: "Claimed by me" },
  { value: "unclaimed", label: "Nobody has claimed" },
];

/**
 * O11 — the Verify queue (PRD F18, PRD-OPS-WF-002).
 *
 * Critical fields on content in review or already live that have not been confirmed
 * against a source, and every field a reviewer sent here because its source changed. Worst
 * first, so the field travelers are relying on today is never on page four.
 */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const query = await searchParams;
  const filter = FILTERS.find((f) => f.value === query.show)?.value ?? "all";

  const supabase = await opsSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const loaded = await loadVerifyQueue().then(
    (value) => ({ ok: true as const, value }),
    () => ({ ok: false as const }),
  );

  const rows = loaded.ok ? filterVerifyRows(loaded.value.rows, filter, user?.id ?? "") : [];
  const total = loaded.ok ? loaded.value.rows.length : 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-h1">Verify queue</h1>
        <p className="text-body text-text-secondary">
          Critical fields still to be confirmed against a source — on content in review, and on
          content travelers can already see. Claim one, check it, record what you found.
        </p>
        {loaded.ok && total > 0 ? (
          <p className="text-body-sm text-text-secondary">{total} waiting, worst first.</p>
        ) : null}
      </header>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="verify-show" className="text-body-sm font-medium">
            Show
          </label>
          <NativeSelect id="verify-show" name="show" defaultValue={filter}>
            {FILTERS.map((option) => (
              <NativeSelectOption key={option.value} value={option.value}>
                {option.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>

      {!loaded.ok ? (
        <LoadProblem />
      ) : rows.length === 0 ? (
        filter === "all" ? (
          <QueueEmpty
            icon={ShieldCheck}
            title="Nothing waiting to be verified"
            description="That is the healthy state, not an empty one. Critical fields short of verified, and re-verification tasks, appear here."
          />
        ) : (
          <QueueEmpty
            icon={Filter}
            title="Nothing matches that filter"
            description="Try All to see everything waiting to be verified."
          />
        )
      ) : (
        <VerifyQueue rows={rows} sources={loaded.value.sources} userId={user?.id ?? ""} />
      )}
    </div>
  );
}
