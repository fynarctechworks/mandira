-- pgTAP: a journey's change history belongs to the traveler it happened to
-- (B-026, PRD-ADPT-004/005, PRD-PRIV-002).
--
-- `journey_change_events` records what the product noticed about someone's day and what it
-- proposed. That is a behavioural record — where they fell behind, what they declined —
-- and it deserves the same isolation as the journey itself.

begin;
select plan(9);

create function test_become(p_user uuid) returns void
language plpgsql as $fn$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', p_user, 'role', 'authenticated')::text);
end;
$fn$;

insert into auth.users (id, instance_id, aud, role, email) values
  ('e1000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'walker@change.test'),
  ('e1000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'stranger@change.test');

insert into journeys (id, owner_user_id, title, start_date, end_date, timezone)
values ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001',
        'A day that slipped', '2026-10-12', '2026-10-12', 'Asia/Kolkata');

-- ── The trigger vocabulary matches the engine's, exactly ────────────────────
-- The route validates against a Zod enum and the column is a Postgres enum. If the two
-- ever disagree, one of them silently rejects a trigger the other considers valid — and
-- the failure lands on a traveler mid-journey rather than in a test.
select is(
  (select count(*)::int from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'change_trigger_enum'),
  10,
  'change_trigger_enum still carries exactly the engine''s ten trigger kinds'
);

select ok(
  exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
           where t.typname = 'change_trigger_enum' and e.enumlabel = 'user_late'),
  'including user_late, which is the one the Live screen raises'
);

-- ── The owner ───────────────────────────────────────────────────────────────
select test_become('e1000000-0000-4000-8000-000000000001');

insert into journey_change_events (id, journey_id, trigger, impact, change_card)
values ('e3000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001',
        'user_late', '{"outcome":"tight"}'::jsonb, '{"options":[]}'::jsonb);

select isnt_empty(
  $$ select 1 from journey_change_events $$,
  'the traveler can see what was proposed for their own day'
);

-- An undecided card is the normal resting state: offered, not yet answered.
select is(
  (select decided_at from journey_change_events
    where id = 'e3000000-0000-4000-8000-000000000001'),
  null,
  'a freshly offered card is undecided — nothing is applied until a tap (PRD-ADPT-005)'
);

-- "Keep as is" is a decision, recorded with a null option index rather than no row.
update journey_change_events
   set decided_at = now(), chosen_option_index = null
 where id = 'e3000000-0000-4000-8000-000000000001';

select is(
  (select chosen_option_index from journey_change_events
    where id = 'e3000000-0000-4000-8000-000000000001'),
  null,
  'keeping things as they are is recorded as a decision, not as an absence'
);

select isnt(
  (select decided_at from journey_change_events
    where id = 'e3000000-0000-4000-8000-000000000001'),
  null,
  'and it is stamped, so the card cannot be answered twice'
);

-- ── The stranger ────────────────────────────────────────────────────────────
select test_become('e1000000-0000-4000-8000-000000000002');

select is_empty(
  $$ select 1 from journey_change_events $$,
  'a stranger cannot read where someone else fell behind'
);

-- An UPDATE filtered away by RLS reports success and changes nothing, so the assertion
-- has to be on the ROW.
update journey_change_events
   set chosen_option_index = 0, applied_changes = '[{"op":"remove"}]'::jsonb
 where journey_id = 'e2000000-0000-4000-8000-000000000001';

select test_become('e1000000-0000-4000-8000-000000000001');

select is(
  (select chosen_option_index from journey_change_events
    where id = 'e3000000-0000-4000-8000-000000000001'),
  null,
  'and cannot answer a card on someone else''s behalf'
);

select is(
  (select applied_changes from journey_change_events
    where id = 'e3000000-0000-4000-8000-000000000001'),
  null,
  'nor apply changes to their journey through it'
);

select * from finish();
rollback;
