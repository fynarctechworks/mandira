-- pgTAP: a share link shows the journey and nothing about the people on it
-- (B-021, PRD-PREP-004, TRD-SEC-004).
--
-- This is the only surface in Mandhira that a stranger can reach without signing in, and
-- the only place where RLS is not what protects the data — `share_summary` is SECURITY
-- DEFINER, so the projection inside it IS the control. Every assertion below is therefore
-- about what the function refuses to hand back, not about what it returns.
--
-- The three that matter most: an expired token, a revoked token, and the traveler profile.
-- The first two are promises made to the person who shared; the third is a promise made to
-- everyone else in the group, who never agreed to be shared at all.

begin;
select plan(22);

-- ── Identity helpers ────────────────────────────────────────────────────────
create function test_become(p_user uuid) returns void
language plpgsql as $fn$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', p_user, 'role', 'authenticated')::text);
end;
$fn$;

create function test_become_anon() returns void
language plpgsql as $fn$
begin
  execute 'set local role anon';
  execute 'set local request.jwt.claims = ''{"role":"anon"}''';
end;
$fn$;

-- ── An owner, a stranger, a journey, and someone travelling on it ───────────
insert into auth.users (id, instance_id, aud, role, email) values
  ('b1000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'owner@share.test'),
  ('b1000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'stranger@share.test');

insert into journeys (id, owner_user_id, title, start_date, end_date, timezone)
values ('b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001',
        'A shared journey', '2026-10-12', '2026-10-13', 'Asia/Kolkata');

insert into journey_items (id, journey_id, day_index, sort_order, item_type, tier, note)
values ('b3000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001',
        0, 0, 'experience', 'protected',
        'Ask about Amma''s wheelchair at the side gate');

-- A real mobility need, recorded against a named person. Nothing about this row may ever
-- appear behind a link that gets forwarded through a family WhatsApp group.
insert into traveler_profiles (id, owner_user_id, label, mobility, age_band)
values ('b4000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001',
        'Amma', 'wheelchair', 'senior');

insert into journey_travelers (journey_id, traveler_profile_id)
values ('b2000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001');

insert into journey_shares (journey_id, token, expires_at, created_by) values
  ('b2000000-0000-4000-8000-000000000001', 'live-token-b021',
   now() + interval '30 days', 'b1000000-0000-4000-8000-000000000001'),
  ('b2000000-0000-4000-8000-000000000001', 'expired-token-b021',
   now() - interval '1 day', 'b1000000-0000-4000-8000-000000000001');

-- ══════════════════════════════════════════════════════════════════════════════
-- A signed-out stranger with a live token.
-- ══════════════════════════════════════════════════════════════════════════════
select test_become_anon();

select isnt(share_summary('live-token-b021'), null,
            'a live token opens the summary while signed out');

select is(share_summary('live-token-b021') -> 'journey' ->> 'title', 'A shared journey',
          'and the journey it names is the right one');

select is(jsonb_array_length(share_summary('live-token-b021') -> 'items'), 1,
          'the items come through');

-- ── What it must NOT contain ────────────────────────────────────────────────
-- Asserted on the whole serialised payload rather than field by field: a future column
-- added carelessly to the projection would slip past a field-by-field check.
select unalike(share_summary('live-token-b021')::text, '%wheelchair%',
              'no traveler mobility anywhere in the payload');

select unalike(share_summary('live-token-b021')::text, '%Amma%',
              'no traveler name anywhere in the payload');

select unalike(share_summary('live-token-b021')::text, '%side gate%',
              'no item note — those are the owner''s private annotations');

select unalike(share_summary('live-token-b021')::text,
              '%b1000000-0000-4000-8000-000000000001%',
              'no owner user id — a share says what, never who');

select is(share_summary('live-token-b021') -> 'journey' ? 'ownerUserId', false,
          'and no owner field at all, empty or otherwise');

-- ══════════════════════════════════════════════════════════════════════════════
-- Tokens that must not work.
-- ══════════════════════════════════════════════════════════════════════════════
select is(share_summary('expired-token-b021'), null,
          'an expired token returns nothing');

select is(share_summary('never-existed'), null,
          'an unknown token returns nothing');

select is(share_summary(''), null,
          'and neither does an empty one');

-- ── Revocation, from both sides ─────────────────────────────────────────────
-- Revoking is a hard delete (see lib/share.ts), and only the owner can do it — `anon`
-- holding the token has no rights on the table at all, which is itself worth asserting:
-- a share link must not let its holder tamper with the sharing.
select throws_ok(
  $$ delete from journey_shares where token = 'live-token-b021' $$,
  '42501',
  null,
  'the holder of a link cannot revoke it, or anyone else''s'
);

select test_become('b1000000-0000-4000-8000-000000000001');
delete from journey_shares where token = 'expired-token-b021';

select test_become_anon();
select is(share_summary('expired-token-b021'), null,
          'a token the owner revoked stays dead');

-- ══════════════════════════════════════════════════════════════════════════════
-- The projection cannot be reached without a token.
--
-- `journey_summary_payload` takes a bare journey id and checks nothing, so a client grant
-- on it would make every journey readable by anyone who can guess a uuid. This is the
-- assertion that keeps that true as the file gets edited later.
-- ══════════════════════════════════════════════════════════════════════════════
select throws_ok(
  $$ select journey_summary_payload('b2000000-0000-4000-8000-000000000001'::uuid, 'en') $$,
  '42501',
  null,
  'anon cannot call the projection directly — only through a door that checks something'
);

select ok(
  not has_function_privilege('anon', 'journey_summary_payload(uuid, text)', 'execute'),
  'and that is a missing grant, not an accident of the search path'
);

-- ══════════════════════════════════════════════════════════════════════════════
-- The owner's own door.
-- ══════════════════════════════════════════════════════════════════════════════
select test_become('b1000000-0000-4000-8000-000000000001');

select isnt(my_journey_summary('b2000000-0000-4000-8000-000000000001'::uuid), null,
            'the owner reads their own summary without minting a link');

select is(
  my_journey_summary('b2000000-0000-4000-8000-000000000001'::uuid),
  share_summary('live-token-b021'),
  'and sees EXACTLY what the share link shows — one projection, two doors'
);

-- ── The stranger ────────────────────────────────────────────────────────────
select test_become('b1000000-0000-4000-8000-000000000002');

select is(my_journey_summary('b2000000-0000-4000-8000-000000000001'::uuid), null,
          'a signed-in stranger cannot read a journey they do not own');

select is_empty(
  $$ select 1 from journey_shares where journey_id = 'b2000000-0000-4000-8000-000000000001' $$,
  'and cannot see that a share link exists at all'
);

-- Minting a link for someone else's journey is the attack this prevents: it would turn a
-- read they do not have into a permanent public one.
select throws_ok(
  $$ insert into journey_shares (journey_id, token)
     values ('b2000000-0000-4000-8000-000000000001', 'stranger-minted') $$,
  '42501',
  null,
  'and cannot mint a link to it'
);

-- ══════════════════════════════════════════════════════════════════════════════
-- Prepare tasks belong to the journey's owner.
-- ══════════════════════════════════════════════════════════════════════════════
select test_become('b1000000-0000-4000-8000-000000000001');

insert into prepare_tasks (journey_id, engine_key, group_name)
values ('b2000000-0000-4000-8000-000000000001', 'booking:test', 'bookings');

select test_become('b1000000-0000-4000-8000-000000000002');

select is_empty(
  $$ select 1 from prepare_tasks
      where journey_id = 'b2000000-0000-4000-8000-000000000001' $$,
  'a stranger cannot read someone else''s prepare tasks'
);

-- An UPDATE that matches no row through RLS reports success and changes nothing, so the
-- assertion has to be on the ROW, not on the statement.
update prepare_tasks set is_done = true
 where journey_id = 'b2000000-0000-4000-8000-000000000001';

select test_become('b1000000-0000-4000-8000-000000000001');

select is(
  (select is_done from prepare_tasks
    where journey_id = 'b2000000-0000-4000-8000-000000000001'
      and engine_key = 'booking:test'),
  false,
  'and ticking one of them off leaves it exactly as it was'
);

select * from finish();
rollback;
