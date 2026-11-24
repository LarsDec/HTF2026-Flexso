/**
 * Calendar helpers for the bakery reorder logic. Dates are whole days written as ISO strings
 * ("2026-11-24"); all day arithmetic is done in UTC so a day is always exactly one day long.
 * The pantry's own clock (its time zone) is only used to answer "what day / time is it there now?".
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date in the form YYYY-MM-DD. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function toUtcMs(isoDate: string): number {
  if (!isIsoDate(isoDate)) throw new RangeError(`not a date (YYYY-MM-DD): ${isoDate}`);
  return Date.parse(`${isoDate}T00:00:00Z`);
}

/** "2026-11-24" + 18 → "2026-12-12". */
export function addDays(isoDate: string, days: number): string {
  return new Date(toUtcMs(isoDate) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday (like `Date.getDay`). */
export function weekdayOf(isoDate: string): number {
  return new Date(toUtcMs(isoDate)).getUTCDay();
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);
}

/** Local date and minutes after midnight of an instant in a time zone. */
export interface LocalTime {
  readonly date: string;
  readonly minutes: number;
}

/** Where is the pantry's clock at `instant`? E.g. 2026-11-24T04:30Z in Europe/Brussels → 05:30. */
export function localTimeIn(instant: Date, timeZone: string): LocalTime {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? '00';
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    minutes: Number(part('hour')) * 60 + Number(part('minute')),
  };
}

/** True when the time zone name is one the runtime knows ("Europe/Brussels", "UTC" …). */
export function isTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value === '') return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** "05:00" or "05:00:00" (CDS Time) → 300. Returns undefined for anything else. */
export function parseClockTime(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : undefined;
}

/** Is `minutes` inside [start, end)? Handles windows over midnight such as 20:00–05:00. */
export function isInWindow(minutes: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}
