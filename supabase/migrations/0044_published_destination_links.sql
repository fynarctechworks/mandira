-- ══════════════════════════════════════════════════════════════════════════════
-- 0044 · Nearby meaningful places, through the publish gate
--
-- PRD F2 ends the destination page with "Nearby meaningful places". The links live in
-- `destination_links`, a knowledge table travelers cannot read (0008). This view exposes a
-- link only when BOTH ends are published destinations, with the nearby one's name and
-- slug, and nothing an operator wrote beyond the traveler-facing note.
--
-- Same model as every other v_published_* view (0007): definer rights, and the grant below
-- is the access control.
-- ══════════════════════════════════════════════════════════════════════════════

create view v_published_destination_links as
select
  l.destination_id,
  l.nearby_destination_id,
  l.note_i18n,
  nearby.slug as nearby_slug,
  nearby.name_i18n as nearby_name_i18n,
  nearby.region as nearby_region,
  nearby.editorial_weight as nearby_editorial_weight
from destination_links l
join v_published_destinations origin on origin.id = l.destination_id
join v_published_destinations nearby on nearby.id = l.nearby_destination_id;

comment on view v_published_destination_links is
  'PRD F2 nearby meaningful places: links whose both ends are published destinations (0044).';

revoke all on v_published_destination_links from public;
grant select on v_published_destination_links to anon, authenticated, service_role;
