import Link from "next/link";
import { LoadProblem } from "./load-problem";
import { PublishStatusTag } from "./publish-status-tag";

type Linked = { id: string; label: string; status: string };

export type PlaceConnectionsData = {
  experiences: Linked[];
  routes: (Linked & { stop: number })[];
  facilities: (Linked & { subtype: string | null; distance_m: number })[];
};

const SUBTYPE: Record<string, string> = {
  restroom: "Restroom",
  drinking_water: "Drinking water",
  cloakroom: "Cloakroom",
  medical: "Medical",
  parking: "Parking",
  atm: "ATM",
  rest_area: "Rest area",
  help_desk: "Help desk",
};

/**
 * What a place is connected to (PRD F19 "link places ↔ experiences ↔ routes ↔ facilities",
 * OPS-REL-01): read-only, from `ops_place_connections()` (0051). Experiences and routes link
 * here from their own editors; facilities are the ones within 500 metres.
 */
export function PlaceConnections({ data }: { data: PlaceConnectionsData | null }) {
  return (
    <section
      aria-labelledby="connections-heading"
      className="flex flex-col gap-4 rounded-card border border-border-subtle bg-surface p-4"
    >
      <div>
        <h2 id="connections-heading" className="text-h3">
          Connections
        </h2>
        <p className="mt-1 text-body-sm text-text-secondary">
          Experiences and routes link to this place from their own editors. Facilities are the ones
          within 500 metres of its pin.
        </p>
      </div>

      {!data ? (
        <LoadProblem />
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <Group title="Experiences here" empty={data.experiences.length === 0}>
            {data.experiences.map((item) => (
              <Item key={item.id} href={`/experiences/${item.id}`} item={item} />
            ))}
          </Group>
          <Group title="Routes that stop here" empty={data.routes.length === 0}>
            {data.routes.map((item) => (
              <Item
                key={item.id}
                href={`/routes/${item.id}`}
                item={item}
                detail={`Stop ${item.stop}`}
              />
            ))}
          </Group>
          <Group title="Facilities within 500 metres" empty={data.facilities.length === 0}>
            {data.facilities.map((item) => (
              <Item
                key={item.id}
                href={`/places/${item.id}`}
                item={item}
                detail={[
                  item.subtype ? (SUBTYPE[item.subtype] ?? item.subtype) : null,
                  `${item.distance_m} m`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
            ))}
          </Group>
        </div>
      )}
    </section>
  );
}

function Group({
  title,
  empty,
  children,
}: {
  title: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-body-sm font-medium">{title}</h3>
      {empty ? (
        <p className="text-body-sm text-text-tertiary">None yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">{children}</ul>
      )}
    </div>
  );
}

function Item({ href, item, detail }: { href: string; item: Linked; detail?: string }) {
  return (
    <li className="flex flex-col gap-0.5 text-body-sm">
      <Link href={href} className="focus-ring font-medium text-brand-primary-text hover:underline">
        {item.label}
      </Link>
      <span className="flex flex-wrap items-center gap-2 text-caption text-text-secondary">
        {detail ? <span>{detail}</span> : null}
        <PublishStatusTag status={item.status} />
      </span>
    </li>
  );
}
