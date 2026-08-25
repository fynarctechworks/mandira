-- pgTAP: TRD §4.1 enum contract (TRD-DB-002).
--
-- Enum names and values are normative and referenced verbatim by the engine, API and UI.
-- This test is the guard against silent drift: if someone reorders, renames or drops a
-- value, this fails. Adding a value at the END is the only backward-compatible change,
-- so `has_enum_labels` compares the full ordered list.

begin;
select plan(28);

-- Every enum type from §4.1 must exist.
select has_type('public', 'publish_status_enum', 'publish_status_enum exists');
select has_type('public', 'verification_status_enum', 'verification_status_enum exists');
select has_type('public', 'source_tier_enum', 'source_tier_enum exists');
select has_type('public', 'freshness_enum', 'freshness_enum exists');
select has_type('public', 'confidence_enum', 'confidence_enum exists');
select has_type('public', 'place_type_enum', 'place_type_enum exists');
select has_type('public', 'facility_subtype_enum', 'facility_subtype_enum exists');
select has_type('public', 'experience_type_enum', 'experience_type_enum exists');
select has_type('public', 'availability_kind_enum', 'availability_kind_enum exists');
select has_type('public', 'travel_mode_enum', 'travel_mode_enum exists');
select has_type('public', 'difficulty_enum', 'difficulty_enum exists');
select has_type('public', 'guidance_type_enum', 'guidance_type_enum exists');
select has_type('public', 'priority_tier_enum', 'priority_tier_enum exists');
select has_type('public', 'journey_item_type_enum', 'journey_item_type_enum exists');
select has_type('public', 'journey_status_enum', 'journey_status_enum exists');
select has_type('public', 'health_state_enum', 'health_state_enum exists');
select has_type('public', 'mobility_enum', 'mobility_enum exists');
select has_type('public', 'age_band_enum', 'age_band_enum exists');
select has_type('public', 'pace_enum', 'pace_enum exists');
select has_type('public', 'report_type_enum', 'report_type_enum exists');
select has_type('public', 'report_status_enum', 'report_status_enum exists');
select has_type('public', 'ops_role_enum', 'ops_role_enum exists');
select has_type('public', 'review_task_type_enum', 'review_task_type_enum exists');
select has_type('public', 'task_status_enum', 'task_status_enum exists');
select has_type('public', 'change_trigger_enum', 'change_trigger_enum exists');
select has_type('public', 'notification_type_enum', 'notification_type_enum exists');
select has_type('public', 'ai_task_enum', 'ai_task_enum exists');

-- Exact labels, in order, for every enum in one comparison.
select is(
  (
    select jsonb_object_agg(typname, labels)
    from (
      select t.typname, jsonb_agg(e.enumlabel order by e.enumsortorder) as labels
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      join pg_enum e on e.enumtypid = t.oid
      where n.nspname = 'public' and t.typtype = 'e'
      group by t.typname
    ) s
  ),
  '{
    "publish_status_enum": ["draft","in_review","published","archived"],
    "verification_status_enum": ["unverified","ai_extracted","human_reviewed","verified","disputed"],
    "source_tier_enum": ["T1","T2","T3","T4","T5"],
    "freshness_enum": ["fresh","aging","stale"],
    "confidence_enum": ["high","medium","low"],
    "place_type_enum": ["temple","shrine","sacred_site","ghat","viewpoint","facility","transport_point","accommodation","food"],
    "facility_subtype_enum": ["restroom","drinking_water","cloakroom","medical","parking","atm","rest_area","help_desk"],
    "experience_type_enum": ["darshan","ritual","aarti","seva","festival","event","walk","cultural","other"],
    "availability_kind_enum": ["always_during_opening","daily_fixed_times","weekly_pattern","date_range","calendar_dates","on_request"],
    "travel_mode_enum": ["walk","vehicle","public_transport","hired","other"],
    "difficulty_enum": ["easy","moderate","hard"],
    "guidance_type_enum": ["before_you_go","what_to_carry","etiquette","timing_tip","safety","family","accessibility"],
    "priority_tier_enum": ["fixed","protected","important","optional"],
    "journey_item_type_enum": ["experience","travel_leg","rest","meal","fixed_commitment","free_time"],
    "journey_status_enum": ["draft","upcoming","active","completed","archived"],
    "health_state_enum": ["comfortable","tight","at_risk","broken"],
    "mobility_enum": ["full","limited_walking","wheelchair","needs_rest_frequently"],
    "age_band_enum": ["child","adult","senior"],
    "pace_enum": ["relaxed","balanced","full"],
    "report_type_enum": ["timing_changed","closed","accessibility_issue","wrong_information","outdated_guidance","other"],
    "report_status_enum": ["new","triaged","verifying","resolved_updated","resolved_confirmed_correct","resolved_unverifiable","closed"],
    "ops_role_enum": ["researcher","reviewer","verifier","editor","approver","translator","media","support","admin"],
    "review_task_type_enum": ["review","verify","conflict","approve","report","reverify"],
    "task_status_enum": ["open","in_progress","done","rejected"],
    "change_trigger_enum": ["user_late","user_done_delta","user_stay_longer","knowledge_update","live_transport","live_weather","item_added","item_removed","preferences_changed","availability_changed"],
    "notification_type_enum": ["prepare_deadline","journey_tomorrow","leave_by","journey_change","report_resolved","advisory","suggestion"],
    "ai_task_enum": ["intent_extract","explain","search_query","conversational_plan","extract_knowledge","detect_changes","contradiction_check","suggest_translation","classify","embed"]
  }'::jsonb,
  'every enum has exactly the TRD §4.1 labels, in order'
);

select * from finish();
rollback;
