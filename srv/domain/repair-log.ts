/**
 * Validation of a repair that the water keeper logs by hand. Pure: `now` is a parameter.
 * The result feeds the existing "repaired" rule in repair-status.ts, nothing is duplicated here.
 */
import { toDate } from './numbers';

export interface RepairLogInput {
  issue?: string | null;
  repairDate?: string | null;
  repairedBy?: string | null;
}

export interface RepairLogError {
  code: 400;
  message: string;
  target: 'issue' | 'repairDate' | 'repairedBy';
}

export interface RepairLogRecord {
  issue: string;
  repairDate: string;
  repairedBy: string;
}

export type RepairLogResult =
  | { ok: true; record: RepairLogRecord }
  | { ok: false; errors: RepairLogError[] };

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Checks the three fields; a valid repair is returned as a ready-to-insert record. */
export function validateRepairLog(input: RepairLogInput, now: Date): RepairLogResult {
  const errors: RepairLogError[] = [];

  const issue = (input.issue ?? '').trim();
  if (issue === '') errors.push({ code: 400, message: 'Describe what was wrong with the pipe.', target: 'issue' });

  const repairedBy = (input.repairedBy ?? '').trim();
  if (repairedBy === '') {
    errors.push({ code: 400, message: 'Enter who did the repair.', target: 'repairedBy' });
  } else if (repairedBy.toLowerCase() === 'system') {
    errors.push({ code: 400, message: "Enter the name of the person who did the repair, not 'system'.", target: 'repairedBy' });
  }

  const rawDate = (input.repairDate ?? '').trim();
  const today = now.toISOString().slice(0, 10);
  let repairDate = '';
  if (rawDate === '') {
    errors.push({ code: 400, message: 'Enter the date of the repair.', target: 'repairDate' });
  } else if (!DATE_ONLY.test(rawDate) || toDate(rawDate) === null) {
    errors.push({ code: 400, message: 'The repair date is not a valid date (use yyyy-mm-dd).', target: 'repairDate' });
  } else if (rawDate > today) {
    errors.push({ code: 400, message: 'The repair date cannot be in the future: only log a repair that is done.', target: 'repairDate' });
  } else {
    // Today = the moment of logging (so it is never "in the future"); an earlier day = midday UTC.
    repairDate = rawDate === today ? now.toISOString() : `${rawDate}T12:00:00.000Z`;
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, record: { issue, repairDate, repairedBy } };
}
