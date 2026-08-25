-- 0020_prepare_task_keys.sql — give a prepare task a stable identity across regeneration.
--
-- `generatePrepareTasks` already emits a stable id per task (`booking:<item-uuid>`,
-- `carry:entry:<place-uuid>`, `downloads:offline`). Nothing persisted it, so regenerating
-- the checklist after any journey edit would either duplicate every task or lose every
-- tick. This column is what makes the checklist idempotent.
--
-- Nullable on purpose: a null key means a task the TRAVELER wrote, which the engine must
-- never overwrite or delete. Postgres treats nulls as distinct in a unique index, so a
-- journey can carry many traveler-authored tasks and at most one row per engine key.

alter table prepare_tasks
  add column if not exists engine_key text;

comment on column prepare_tasks.engine_key is
  'Stable id from generatePrepareTasks, or null for a traveler-authored task. '
  'Unique per journey so regeneration upserts rather than duplicating (0020).';

-- NOT a partial index, though `where engine_key is not null` reads like the obvious way to
-- say "traveler tasks are exempt". Two reasons it would be wrong:
--
--   1. ON CONFLICT cannot use a partial unique index unless every statement repeats the
--      predicate, so the upsert this column exists FOR would fail outright.
--   2. It buys nothing. NULLS DISTINCT is the default, so a plain unique index already
--      lets one journey carry any number of traveler-authored rows.
create unique index if not exists prepare_tasks_engine_key_uniq
  on prepare_tasks (journey_id, engine_key);

-- ══════════════════════════════════════════════════════════════════════════════
-- Why title_i18n and body_i18n stay empty for engine-derived tasks.
--
-- The same argument as Journey Health, which is recomputed on every read and never
-- stored. A task's wording comes from three moving things: the message catalogue (hi/te
-- are scaffolds until M4), the knowledge behind it (a temple changes its dress code), and
-- the journey itself. Freezing a sentence into a row at generation time means a journey
-- planned today keeps today's English and today's dress code forever — and the traveler
-- reads it at the gate, which is the worst place to find out it went stale.
--
-- So an engine task stores WHICH task it is and whether it is ticked; the words are
-- rendered at read time from the engine plus the current bundle. These two columns remain
-- for traveler-authored tasks, whose text has no other home.
-- ══════════════════════════════════════════════════════════════════════════════

comment on column prepare_tasks.title_i18n is
  'Traveler-authored task text. Empty for engine-derived tasks, which render their title '
  'from the message catalogue at read time — see the 0020 header.';
