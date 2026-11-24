/**
 * Council report of the investigation app (Ilse, v7): every line she marked with the reason in plain words,
 * plus a timeline of when the marked lines were changed (when it started, at once or bit by bit).
 * Pure functions: no database, no clock, no `cds`. Numbers come only from the data; nothing is invented.
 * See docs/INVESTIGATION-REQUIREMENTS.md, section 7.
 */
import { OAKHAVEN_UTC_OFFSET_MINUTES } from './investigation';
import { toDate } from './numbers';

/** Assumption: lines changed within one hour of each other happened "at once". Otherwise "bit by bit". */
export const AT_ONCE_MINUTES = 60;

/** Assumption: up to 48 hours the timeline groups by hour, beyond that by day. */
export const HOURLY_UP_TO_HOURS = 48;

const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** One marked line: the mark joined with what the rules know about the line. */
export interface MarkedLine {
  entityName: string;
  recordID: string;
  /** Short name of the line, for example "Sensor SENS-004 on BAKERY-BRANCH". */
  label: string;
  /** Her own reason, as stored with the mark. */
  reason: string;
  markedBy: string;
  markedAt: string | null;
  /** Last change of the line itself (UTC ISO), or null when unknown. */
  changedAt: string | null;
  changedBy: string | null;
}

export interface TimelineBucket {
  /** Start of the hour or day, UTC ISO. */
  start: string;
  count: number;
}

/** none: no marked line has a change time. single: one dated line. atOnce / bitByBit: see AT_ONCE_MINUTES. */
export type StartPattern = 'none' | 'single' | 'atOnce' | 'bitByBit';

export interface CouncilReport {
  /** Number of marked lines. */
  total: number;
  /** Number of marked lines with a known change time (the timeline is built from these). */
  dated: number;
  firstChangeAt: string | null;
  lastChangeAt: string | null;
  /** Minutes between the first and the last change. */
  spanMinutes: number;
  pattern: StartPattern;
  granularity: 'hour' | 'day';
  buckets: TimelineBucket[];
  /** Earliest change first; lines without a change time last. */
  lines: MarkedLine[];
}

function time(value: string | null): number {
  const date = toDate(value);
  return date ? date.getTime() : Number.NaN;
}

/** Start of the hour or day that contains `ms`, in Oakhaven time, as a UTC ISO string. */
function bucketStart(ms: number, granularity: 'hour' | 'day', utcOffsetMinutes: number): string {
  const shift = utcOffsetMinutes * MS_PER_MINUTE;
  const unit = granularity === 'hour' ? MS_PER_HOUR : MS_PER_DAY;
  const local = ms + shift;
  return new Date(local - (((local % unit) + unit) % unit) - shift).toISOString();
}

function compareLines(a: MarkedLine, b: MarkedLine): number {
  const timeA = time(a.changedAt);
  const timeB = time(b.changedAt);
  if (Number.isNaN(timeA) !== Number.isNaN(timeB)) return Number.isNaN(timeA) ? 1 : -1;
  if (timeA !== timeB) return timeA - timeB;
  if (a.label !== b.label) return a.label < b.label ? -1 : 1;
  return a.recordID < b.recordID ? -1 : a.recordID > b.recordID ? 1 : 0;
}

export function buildCouncilReport(
  marked: readonly MarkedLine[],
  utcOffsetMinutes: number = OAKHAVEN_UTC_OFFSET_MINUTES,
): CouncilReport {
  const lines = [...marked].sort(compareLines);
  const times = lines.map((line) => time(line.changedAt)).filter((ms) => !Number.isNaN(ms));
  if (times.length === 0) {
    return {
      total: lines.length,
      dated: 0,
      firstChangeAt: null,
      lastChangeAt: null,
      spanMinutes: 0,
      pattern: 'none',
      granularity: 'hour',
      buckets: [],
      lines,
    };
  }
  const first = Math.min(...times);
  const last = Math.max(...times);
  const spanMinutes = Math.round((last - first) / MS_PER_MINUTE);
  const granularity = last - first <= HOURLY_UP_TO_HOURS * MS_PER_HOUR ? 'hour' : 'day';
  const counts = new Map<string, number>();
  for (const ms of times) {
    const start = bucketStart(ms, granularity, utcOffsetMinutes);
    counts.set(start, (counts.get(start) ?? 0) + 1);
  }
  const buckets = [...counts.entries()]
    .sort(([a], [b]) => Date.parse(a) - Date.parse(b))
    .map(([start, count]) => ({ start, count }));
  const pattern: StartPattern = times.length === 1 ? 'single' : spanMinutes <= AT_ONCE_MINUTES ? 'atOnce' : 'bitByBit';
  return {
    total: lines.length,
    dated: times.length,
    firstChangeAt: new Date(first).toISOString(),
    lastChangeAt: new Date(last).toISOString(),
    spanMinutes,
    pattern,
    granularity,
    buckets,
    lines,
  };
}
