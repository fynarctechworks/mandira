import type { IsoDate, TimeOfDay, Weekday } from "./types";

/**
 * Time helpers.
 *
 * The engine works in MINUTES FROM LOCAL MIDNIGHT internally and converts at the edges.
 * Doing arithmetic on Date objects across a journey that may cross a DST boundary or run
 * in a timezone other than the machine's is how "06:30" silently becomes "05:30" — and a
 * traveler misses a darshan slot because of it.
 *
 * Mandhira's launch timezone (Asia/Kolkata) has no DST, but the journey carries its own
 * timezone precisely so this does not have to be assumed.
 */

const WEEKDAYS: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** "HH:MM" → minutes from midnight. Throws on malformed input rather than guessing. */
export function toMinutes(time: TimeOfDay): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) throw new Error(`Not a 24-hour HH:MM time: ${time}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Minutes from midnight → "HH:MM". Values past midnight wrap, and the caller is told. */
export function toTimeOfDay(minutes: number): TimeOfDay {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** True when the minute value has run past the end of its day. */
export function spillsPastMidnight(minutes: number): boolean {
  return minutes >= 1440;
}

/** The date `dayIndex` days after a journey's start, as YYYY-MM-DD. */
export function dateForDay(startDate: IsoDate, dayIndex: number): IsoDate {
  const [y, m, d] = startDate.split("-").map(Number);
  if (!y || !m || !d) throw new Error(`Not an ISO date: ${startDate}`);

  // UTC arithmetic on a date-only value: using local Date would shift the day for anyone
  // west of Greenwich.
  const base = Date.UTC(y, m - 1, d);
  const shifted = new Date(base + dayIndex * 86_400_000);
  return shifted.toISOString().slice(0, 10);
}

export function weekdayOf(date: IsoDate): Weekday {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) throw new Error(`Not an ISO date: ${date}`);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]!;
}

/**
 * Local wall-clock minutes → an absolute instant, expressed as an ISO string carrying the
 * journey's UTC offset.
 *
 * The offset is derived from the timezone for that specific date, so a journey spanning a
 * DST change gets the right answer on both sides of it.
 */
export function toInstant(date: IsoDate, minutes: number, timeZone: string): string {
  const dayOffset = Math.floor(minutes / 1440);
  const localDate = dayOffset === 0 ? date : dateForDay(date, dayOffset);
  const inDay = ((minutes % 1440) + 1440) % 1440;

  const [y, m, d] = localDate.split("-").map(Number);

  // The offset is looked up at roughly the right instant, then the LOCAL wall time is
  // written with it. Writing the UTC wall time with a local offset would denote a
  // different moment entirely — the two disagree by exactly the offset.
  const approximate = new Date(Date.UTC(y!, m! - 1, d!, Math.floor(inDay / 60), inDay % 60));
  const offsetMinutes = offsetAt(new Date(approximate.getTime() - 0), timeZone);

  const hh = String(Math.floor(inDay / 60)).padStart(2, "0");
  const mm = String(inDay % 60).padStart(2, "0");
  return `${localDate}T${hh}:${mm}:00${formatOffset(offsetMinutes)}`;
}

/** An absolute instant → minutes from local midnight on the given date. */
export function fromInstant(iso: string, date: IsoDate, timeZone: string): number {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) throw new Error(`Not a valid instant: ${iso}`);

  const offsetMinutes = offsetAt(instant, timeZone);
  const local = new Date(instant.getTime() + offsetMinutes * 60_000);

  const localDate = local.toISOString().slice(0, 10);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();

  if (localDate === date) return minutes;

  // Express times on neighbouring days relative to the requested day, so an item that runs
  // past midnight stays comparable with the rest of its day.
  const dayDelta = Math.round(
    (Date.parse(`${localDate}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000,
  );
  return minutes + dayDelta * 1440;
}

/** The timezone's UTC offset, in minutes, at a given instant. */
function offsetAt(instant: Date, timeZone: string): number {
  // Intl is the only DST-correct source available without a dependency, and it is present
  // in every runtime this engine runs in (browser, Node, Deno).
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );

  return Math.round((asUtc - instant.getTime()) / 60_000);
}

function formatOffset(minutes: number): string {
  const sign = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}
