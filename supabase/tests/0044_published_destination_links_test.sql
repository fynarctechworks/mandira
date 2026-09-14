-- pgTAP: 0044 — a nearby link reaches travelers only when both destinations are published.
begin;
select plan(4);

insert into destinations (id, slug, name_i18n, centre, radius_km, status) values
  ('f4400000-0000-4000-8000-000000000001', 'links-origin-0044', '{"en":"Origin"}'::jsonb, 'SRID=4326;POINT(80.0 15.0)', 5, 'published'),
  ('f4400000-0000-4000-8000-000000000002', 'links-nearby-0044', '{"en":"Nearby"}'::jsonb, 'SRID=4326;POINT(80.1 15.1)', 5, 'published'),
  ('f4400000-0000-4000-8000-000000000003', 'links-draft-0044', '{"en":"Draft"}'::jsonb, 'SRID=4326;POINT(80.2 15.2)', 5, 'draft');

insert into destination_links (destination_id, nearby_destination_id, note_i18n) values
  ('f4400000-0000-4000-8000-000000000001', 'f4400000-0000-4000-8000-000000000002', '{"en":"An hour by road"}'::jsonb),
  ('f4400000-0000-4000-8000-000000000001', 'f4400000-0000-4000-8000-000000000003', '{"en":"Not ready"}'::jsonb),
  ('f4400000-0000-4000-8000-000000000003', 'f4400000-0000-4000-8000-000000000002', '{"en":"From a draft"}'::jsonb);

set local role anon;

select results_eq(
  $$ select nearby_slug from v_published_destination_links
     where destination_id = 'f4400000-0000-4000-8000-000000000001' $$,
  $$ values ('links-nearby-0044') $$,
  'a guest sees the link to a published destination, and not the one to a draft');

select is_empty(
  $$ select 1 from v_published_destination_links
     where destination_id = 'f4400000-0000-4000-8000-000000000003' $$,
  'a draft destination shows no nearby places at all');

select is(
  (select note_i18n ->> 'en' from v_published_destination_links
    where destination_id = 'f4400000-0000-4000-8000-000000000001'),
  'An hour by road', 'the traveler-facing note comes with it');

select throws_ok(
  $$ select * from destination_links $$,
  '42501', null, 'the base table stays closed to guests');

reset role;
select * from finish();
rollback;
