import Link from "next/link";
import { ExperienceForm } from "@/components/experience-form";
import { anchorOptions } from "@/lib/anchors";
import { destinationOptions } from "@/lib/destinations";
import { emptyExperience } from "@/lib/experience-draft";
import { activeLocales } from "@/lib/locales";

export const metadata = { title: "New experience · Mandhira Ops" };

export default async function NewExperiencePage() {
  const [locales, destinations, anchors] = await Promise.all([
    activeLocales(),
    destinationOptions(),
    anchorOptions(),
  ]);

  // An experience must anchor to a place or route. Say so plainly rather than rendering a
  // form whose required field has nothing to choose.
  if (destinations.length === 0 || anchors.length === 0) {
    return (
      <div className="flex max-w-lg flex-col gap-3">
        <h1 className="text-h1">Add a place or route first</h1>
        <p className="text-body text-text-secondary">
          Every experience happens somewhere, and there is nowhere to attach one to yet.
        </p>
        <Link href="/places/new" className="focus-ring text-body text-brand-primary-text underline">
          Create a place
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-h1">New experience</h1>
        <p className="mt-1 text-body text-text-secondary">
          Saved as a draft. Availability is added after creating it.
        </p>
      </header>
      <ExperienceForm
        locales={locales}
        destinations={destinations}
        anchors={anchors}
        initial={emptyExperience(destinations[0]!.id)}
      />
    </div>
  );
}
