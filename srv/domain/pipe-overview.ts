/**
 * Combines all pure rules into one evaluation of the whole pipe network. Ranking needs the full
 * set, so this always works on every pipe at once.
 */
import { toDate, type NumericInput } from './numbers';
import { rankPipes } from './priority';
import { assessRepair, lastRepairDetails } from './repair-status';
import { describeSourceConflict, flagSourceConflict, type SensorSource } from './source-conflict';
import { assessPipe, healthIcon, MAX_READING_AGE_MS, healthState, readingAgeMinutes, type HealthStatus, type PipeAssessment } from './water-health';

export interface PipeInput {
  ID: string;
  pipeID: string;
  currentFlowRate: NumericInput;
  nominalFlowRate: NumericInput;
  currentPressure: NumericInput;
  sensors: readonly (Partial<SensorSource> & {
    flowRate: NumericInput;
    lastReading: Date | string | null | undefined;
  })[];
  repairs: readonly { repairDate: Date | string | null | undefined; issue?: string | null; repairedBy?: string | null }[];
  /** The pipe or one of its sensors is marked "not to be trusted" (Maren v13: show "I don't know"). */
  untrusted?: boolean;
}

export interface PipeEvaluation {
  ID: string;
  healthStatus: HealthStatus;
  statusReason: string;
  readingAgeMinutes: number | null;
  healthState: 'Error' | 'Warning' | 'Success' | 'None';
  healthIcon: string;
  priorityRank: number;
  priorityReason: string;
  inTodaysPlan: boolean;
  morningRank: number | null;
  sourceConflict: boolean;
  conflictSensorID: string | null;
  conflictSensorFlow: number | null;
  conflictNominalFlow: number | null;
  conflictChangedAt: string | null;
  conflictChangedBy: string | null;
  lastRepairDate: string | null;
  lastRepairIssue: string | null;
  lastRepairedBy: string | null;
  repaired: boolean;
  suspiciousRepair: boolean;
}

/** Freshness of a pipe = newest sensor lastReading (a pipe has no timestamp of its own). */
export function newestReading(sensors: PipeInput['sensors']): Date | null {
  let newest: Date | null = null;
  for (const sensor of sensors) {
    const d = toDate(sensor.lastReading);
    if (d && (!newest || d.getTime() > newest.getTime())) newest = d;
  }
  return newest;
}

export function evaluatePipes(pipes: readonly PipeInput[], now: Date): PipeEvaluation[] {
  const assessed = pipes.map((pipe) => {
    const lastReadingAt = newestReading(pipe.sensors);
    const repair = assessRepair(
      pipe.repairs.map((r) => r.repairDate),
      pipe.sensors.map((s) => s.lastReading),
      now,
    );
    const age = readingAgeMinutes(lastReadingAt, now);
    const assessment: PipeAssessment = pipe.untrusted
      ? { status: 'unknown', reason: 'Marked "not to be trusted", so the numbers are not used.' }
      : repair.repaired && age !== null && age <= MAX_READING_AGE_MS / 60_000
        ? { status: 'fine', reason: 'Repaired: the old readings no longer count. Waiting for the next reading from the pipe.' }
        : assessPipe({ ...pipe, lastReadingAt }, now);
    return { pipe, lastReadingAt, assessment, repair };
  });
  const ranking = new Map(
    rankPipes(assessed.map((a) => ({ pipeID: a.pipe.pipeID, status: a.assessment.status }))).map((r) => [r.pipeID, r]),
  );
  return assessed.map(({ pipe, lastReadingAt, assessment, repair }) => {
    const lastRepair = lastRepairDetails(pipe.repairs, now);
    const rank = ranking.get(pipe.pipeID);
    const conflict = describeSourceConflict(
      pipe.nominalFlowRate,
      pipe.sensors.map((s) => ({
        sensorID: s.sensorID,
        flowRate: s.flowRate,
        modifiedAt: s.modifiedAt,
        modifiedBy: s.modifiedBy,
      })),
    );
    return {
      ID: pipe.ID,
      healthStatus: assessment.status,
      statusReason: assessment.reason,
      readingAgeMinutes: readingAgeMinutes(lastReadingAt, now),
      healthState: healthState(assessment.status),
      healthIcon: healthIcon(assessment.status),
      priorityRank: rank?.priorityRank ?? 0,
      priorityReason: rank?.priorityReason ?? '',
      inTodaysPlan: rank?.inTodaysPlan ?? false,
      morningRank: rank?.morningRank ?? null,
      sourceConflict: flagSourceConflict(pipe.nominalFlowRate, pipe.sensors.map((s) => s.flowRate)),
      conflictSensorID: conflict?.sensorID ?? null,
      conflictSensorFlow: conflict?.sensorFlow ?? null,
      conflictNominalFlow: conflict?.nominalFlow ?? null,
      conflictChangedAt: conflict?.changedAt ?? null,
      conflictChangedBy: conflict?.changedBy ?? null,
      lastRepairDate: repair.lastRepairDate ? repair.lastRepairDate.toISOString() : null,
      lastRepairIssue: lastRepair.issue,
      lastRepairedBy: lastRepair.repairedBy,
      repaired: repair.repaired,
      suspiciousRepair: repair.suspiciousRepair,
    };
  });
}
