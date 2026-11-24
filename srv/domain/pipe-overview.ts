/**
 * Combines all pure rules into one evaluation of the whole pipe network. Ranking needs the full
 * set, so this always works on every pipe at once.
 */
import { toDate, type NumericInput } from './numbers';
import { rankPipes } from './priority';
import { assessRepair } from './repair-status';
import { flagSourceConflict } from './source-conflict';
import { assessPipe, healthIcon, healthState, readingAgeMinutes, type HealthStatus } from './water-health';

export interface PipeInput {
  ID: string;
  pipeID: string;
  currentFlowRate: NumericInput;
  nominalFlowRate: NumericInput;
  currentPressure: NumericInput;
  sensors: readonly { flowRate: NumericInput; lastReading: Date | string | null | undefined }[];
  repairs: readonly { repairDate: Date | string | null | undefined }[];
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
  sourceConflict: boolean;
  lastRepairDate: string | null;
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
    return { pipe, lastReadingAt, assessment: assessPipe({ ...pipe, lastReadingAt }, now) };
  });
  const ranking = new Map(
    rankPipes(assessed.map((a) => ({ pipeID: a.pipe.pipeID, status: a.assessment.status }))).map((r) => [r.pipeID, r]),
  );
  return assessed.map(({ pipe, lastReadingAt, assessment }) => {
    const repair = assessRepair(
      pipe.repairs.map((r) => r.repairDate),
      pipe.sensors.map((s) => s.lastReading),
      now,
    );
    const rank = ranking.get(pipe.pipeID);
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
      sourceConflict: flagSourceConflict(pipe.nominalFlowRate, pipe.sensors.map((s) => s.flowRate)),
      lastRepairDate: repair.lastRepairDate ? repair.lastRepairDate.toISOString() : null,
      repaired: repair.repaired,
      suspiciousRepair: repair.suspiciousRepair,
    };
  });
}
