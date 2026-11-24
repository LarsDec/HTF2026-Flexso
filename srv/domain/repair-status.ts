/**
 * Repair state of a pipe. Pure: `now` is a parameter.
 */
import { toDate } from './numbers';

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
