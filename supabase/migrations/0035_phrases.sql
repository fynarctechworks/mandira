-- 0035_phrases.sql — phrase packs reach travelers with their audio (PRD-LANG-004, A17).
--
-- Everything else phrase packs need already exists and is NOT repeated here:
--   * the table, its RLS, grants and version history ............ 0003, 0008, 0030
--   * the publish guard (only publish_entity() publishes) ........ 0029 S-1
--   * the Ops audit trigger ...................................... 0029 S-3
--   * publish_entity / validate_for_publish accept 'phrases' ..... 0011, 0029, 0032
--   * v_published_phrases, readable by anon and authenticated .... 0007
--
-- The one gap: `phrases.audio_media_id` points at a media asset, but a traveler cannot read
-- that asset. `media_assets_public_read` (0029) opens a media row only when an
-- `entity_media` link ties it to a published entity, and phrase audio is linked by column,
-- not through `entity_media`. So the published view carries the storage path itself.
--
-- ADDITIVE: `create or replace view` may only append columns, which keeps every existing
-- column, its order, and the view's grants exactly as they were. anon and authenticated
-- privileges do not change, so 0031's exact-count assertions are untouched.
--
-- Audio is exposed only when the asset is live, is audio, and carries a licence. PRD F18
-- makes "media has licence" a publish rule; `validate_for_publish` checks it for
-- `entity_media` links only, so the view refuses unlicensed audio rather than playing it.
-- A phrase without playable audio is still a complete phrase: text and transliteration.

create or replace view v_published_phrases as
select
  ph.id, ph.destination_id, ph.context_tag, ph.source_locale, ph.source_text,
  ph.translations, ph.audio_media_id, ph.sort_order, ph.published_at,
  entity_trust('phrases', ph.id) as trust,
  (
    select ma.storage_path
      from media_assets ma
     where ma.id = ph.audio_media_id
       and ma.media_type = 'audio'
       and ma.deleted_at is null
       and coalesce(btrim(ma.licence), '') <> ''
  ) as audio_path
from phrases ph
where ph.status = 'published';

comment on view v_published_phrases is
  'Published phrases (PRD F12). audio_path is the media bucket path of a live, licensed audio '
  'asset, or null (0035).';
