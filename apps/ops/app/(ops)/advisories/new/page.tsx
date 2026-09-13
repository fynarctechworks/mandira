import Link from "next/link";
import { AdvisoryForm } from "@/components/advisory-form";
import { destinationOptions } from "@/lib/destinations";
import { activeLocales } from "@/lib/locales";
import { activeSources } from "@/lib/sources";

export const metadata = { title: "New advisory · Mandhira Ops" };

export default async function NewAdvisoryPage() {
  const [locales, destinations, sources] = await Promise.all([
    activeLocales(),
    destinationOptions(),
    activeSources(),
  ]);

  if (destinations.length === 0) {
    return (
      <div className="flex max-w-lg flex-col gap-3">
        <h1 className="text-h1">Add a destination first</h1>
        <p className="text-body text-text-secondary">
          Every advisory is about a destination, and there aren&apos;t any yet.
        </p>
        <Link href="/destinations/new" className="focus-ring text-body underline">
          Create a destination
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-h1">New advisory</h1>
        <p className="mt-1 text-body text-text-secondary">
          Saved as a draft. Nothing reaches travelers until it is approved and published.
        </p>
      </header>
      <AdvisoryForm
        locales={locales}
        destinations={destinations}
        sources={sources}
        initial={{
          destination_id: destinations[0]!.id,
          title_i18n: {},
          body_i18n: {},
          severity: "info",
          starts_at: null,
          ends_at: null,
          source_id: null,
        }}
      />
    </div>
  );
}
