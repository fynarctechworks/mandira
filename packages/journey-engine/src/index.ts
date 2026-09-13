/**
 * @mandhira/journey-engine — pure, deterministic journey logic.
 *
 * ARCHITECTURE §3: zero imports from apps, providers or Supabase. No network, no database,
 * no ambient clock — every input arrives as an argument, including "now". That is what
 * makes the engine behave identically on a server and on a phone in airplane mode
 * (D-005), and what makes it testable without fixtures for any of them.
 */

export * from "./types";
export { projectActuals } from "./actuals";
export { resolveAvailability, type AvailabilityResult } from "./availability";
export { computeBuffer, BASE_BUFFER_MINUTES } from "./buffer";
export { scheduleDay, travelMinutes, type ScheduleDayResult } from "./schedule";
export { checkReturnGuard, type ReturnGuardResult } from "./return-guard";
export {
  toMinutes,
  toTimeOfDay,
  dateForDay,
  weekdayOf,
  toInstant,
  fromInstant,
  spillsPastMidnight,
} from "./time";
export {
  computeHealth,
  decideState,
  type HealthState,
  type HealthReport,
  type DayHealth,
  type Cause,
  type TrustCause,
} from "./health";
export { generatePrepareTasks, type PrepareTask, type PrepareGroup } from "./prepare";
export { buildInitialJourney, type BuildResult } from "./build";
export {
  evaluateChange,
  applyOption,
  type AffectedItem,
  type ChangeCard,
  type ChangeOption,
  type ChangeOutcome,
  type ChangeTrigger,
  type ChangeTriggerKind,
  type ItemChange,
  type LadderStep,
} from "./change";
export {
  getNowNextLater,
  type LiveProjection,
  type LiveCard,
  type LiveKind,
  type LaterRow,
} from "./live";
export {
  scheduleNotifications,
  applyWeeklyCap,
  NOTIFICATION_DEFAULTS,
  NOTIFICATION_LEAD,
  type NotificationDraft,
  type NotificationPrefs,
  type NotificationType,
} from "./notify";
export {
  checkItemAction,
  checkItemActionFor,
  ITEM_RULE_REASONS,
  type ItemAction,
  type RuleVerdict,
} from "./item-rules";
