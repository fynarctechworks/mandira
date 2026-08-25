import Link from "next/link";
import { RouteForm } from "@/components/route-form";
import { destinationOptions } from "@/lib/destinations";
import { activeLocales } from "@/lib/locales";
import { emptyRoute } from "@/lib/route-draft";

export const metadata = { title: "New route · Mandhira Ops" };

export default async function NewRoutePage() {
  const [locales, destinations] = await Promise.all([activeLocales(), destinationOptions()]);

  if (destinations.length === 0) {
    return (
      <div className="flex max-w-lg flex-col gap-3">
        <h1 className="text-h1">Add a destination first</h1>
        <p className="text-body text-text-secondary">
          A route belongs to a destination, and there are none yet.
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
        <h1 className="text-h1">New route</h1>
        <p className="mt-1 text-body text-text-secondary">
          Saved as a draft. Stops are added after creating it.
        </p>
      </header>
      <RouteForm
        locales={locales}
        destinations={destinations}
        initial={emptyRoute(destinations[0]!.id)}
      />
    </div>
  );
}
