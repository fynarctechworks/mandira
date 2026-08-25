import { TransportEditor, type TransportRow } from "@/components/transport-editor";
import { destinationOptions } from "@/lib/destinations";
import { activeLocales } from "@/lib/locales";
import { placeOptions } from "@/lib/route-draft";
import { opsSupabase } from "@/lib/supabase";

export const metadata = { title: "Transport · Mandhira Ops" };

/**
 * Transport connections (O05, OPS-EDIT-05).
 *
 * `duration_likely_minutes` is a CRITICAL field: the engine builds travel legs from it, so
 * an error here shifts every item after it in the day.
 */
export default async function TransportPage() {
  const supabase = await opsSupabase();

  const [locales, destinations, places, connections] = await Promise.all([
    activeLocales(),
    destinationOptions(),
    placeOptions(),
    supabase
      .from("transport_connections")
      .select(
        "id, destination_id, from_place_id, to_place_id, mode, duration_likely_minutes, duration_max_minutes, operator, status",
      )
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-h1">Transport</h1>
        <p className="mt-1 text-body text-text-secondary">
          How travelers get between places. The usual duration is what the engine plans with.
        </p>
      </header>

      <TransportEditor
        locales={locales}
        destinations={destinations}
        places={places}
        connections={(connections.data ?? []) as TransportRow[]}
      />
    </div>
  );
}
