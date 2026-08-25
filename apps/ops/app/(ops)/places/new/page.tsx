import Link from "next/link";
import { PlaceForm } from "@/components/place-form";
import { emptyPlace } from "@/lib/place-draft";
import { destinationOptions } from "@/lib/destinations";
import { activeLocales } from "@/lib/locales";

export const metadata = { title: "New place · Mandhira Ops" };

export default async function NewPlacePage() {
  const [locales, destinations] = await Promise.all([activeLocales(), destinationOptions()]);

  // A place cannot exist without a destination, so say so plainly rather than rendering a
  // form whose first field is an empty dropdown.
  if (destinations.length === 0) {
    return (
      <div className="flex max-w-lg flex-col gap-3">
        <h1 className="text-h1">Add a destination first</h1>
        <p className="text-body text-text-secondary">
          Every place belongs to a destination, and there aren&apos;t any yet.
        </p>
        <Link
          href="/destinations/new"
          className="focus-ring text-body text-brand-primary-text underline"
        >
          Create a destination
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-h1">New place</h1>
        <p className="mt-1 text-body text-text-secondary">
          Saved as a draft. The critical fields below decide when it can be published.
        </p>
      </header>
      <PlaceForm
        locales={locales}
        destinations={destinations}
        initial={emptyPlace(destinations[0]!.id)}
      />
    </div>
  );
}
