/**
 * Repair state of a pipe. Pure: `now` is a parameter.
 */
import { toDate } from './numbers';
import { isNonPersonEditor } from './investigation';

type DateInput = Date | string | null | undefined;

export interface RepairState {
  /** Newest repair date that is not in the future. */
  lastRepairDate: Date | null;
  /** True when some repair is dated in the future (e.g. entered by `system`): it is not counted as a repair. */
  suspiciousRepair: boolean;
  /** A real repair exists and no sensor measurement is newer than it. */
  repaired: boolean;
}

export function assessRepair(
  repairDates: readonly DateInput[],
  sensorReadings: readonly DateInput[],
  now: Date,
): RepairState {
  let last: Date | null = null;
  let suspicious = false;
  for (const raw of repairDates) {
    const date = toDate(raw);
    if (!date) continue;
    if (date.getTime() > now.getTime()) {
      suspicious = true;
    } else if (!last || date.getTime() > last.getTime()) {
      last = date;
    }
  }
  const lastRepair = last;
  const repaired =
    lastRepair !== null &&
    !sensorReadings.some((raw) => {
      const reading = toDate(raw);
      return reading !== null && reading.getTime() > lastRepair.getTime();
    });
  return { lastRepairDate: lastRepair, suspiciousRepair: suspicious, repaired };
}

export interface RepairRecord {
  repairDate: DateInput;
  issue?: string | null;
  repairedBy?: string | null;
}

export interface LastRepairDetails {
  issue: string | null;
  repairedBy: string | null;
}

/**
 * Who fixed what in the newest repair that is not in the future (same rule as `assessRepair`).
 * A future-dated repair (e.g. by `system`) is never shown as the last repair.
 */
export function lastRepairDetails(repairs: readonly RepairRecord[], now: Date): LastRepairDetails {
  let best: { time: number; repair: RepairRecord } | null = null;
  for (const repair of repairs) {
    const time = toDate(repair.repairDate)?.getTime();
    if (time === undefined || time > now.getTime()) continue;
    if (!best || time > best.time) best = { time, repair };
  }
  return { issue: best?.repair.issue ?? null, repairedBy: best?.repair.repairedBy ?? null };
}

export interface RepairFlags {
  /** Dated after `now`: a repair that has not happened yet, so it is never counted as a repair. */
  futureDated: boolean;
  /** Logged by `system`, another non-person name or no name: nobody did this repair. */
  bySystem: boolean;
  /** Either of the two: the line in the repair log needs a second look. */
  suspicious: boolean;
}

/** Flags one repair line of the log (same "future date" rule as `assessRepair`, plus the non-person editor). */
export function flagRepair(repair: RepairRecord, now: Date): RepairFlags {
  const time = toDate(repair.repairDate)?.getTime();
  const futureDated = time !== undefined && time > now.getTime();
  const bySystem = isNonPersonEditor(repair.repairedBy);
  return { futureDated, bySystem, suspicious: futureDated || bySystem };
}
