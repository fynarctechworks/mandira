/**
 * The engine speaks in i18n keys with parameters (health causes, Change Card options, prepare
 * tasks), and this is the one place those keys become language — through the same message
 * catalogs as every other string, so Telugu and Hindi work the day their catalogs do.
 */
export type Translate = {
  (key: string, values?: Record<string, string | number>): string;
  has: (key: string) => boolean;
};

/**
 * Every placeholder any engine message may reference, with a neutral value.
 *
 * ICU formatting refuses a message whose placeholder has no value, and the engine does not
 * send every parameter for every key. Supplying the full set means a missing parameter reads
 * as a slightly vaguer sentence instead of a raw key on a traveler's screen.
 */
const PLACEHOLDER_DEFAULTS: Record<string, string | number> = {
  minutes: 0,
  at: "",
  closes: "",
  metres: 0,
  limitMetres: 0,
  intervalMinutes: 0,
  count: 0,
  item: "",
  day: "",
  time: "",
  fromMinutes: 0,
  toMinutes: 0,
};

/** Renders an engine key. An unknown key renders as nothing, never as the key itself. */
export function engineText(
  t: Translate,
  key: string,
  params?: Record<string, string | number>,
): string {
  return t.has(key) ? t(key, { ...PLACEHOLDER_DEFAULTS, ...params }) : "";
}
