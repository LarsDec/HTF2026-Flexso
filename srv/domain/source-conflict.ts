/**
 * Flags sources that disagree. Only marks the conflict; it does not decide which source is right.
 */
import { toDate, toNumber, type NumericInput } from './numbers';

/**
 * Our own team heuristic: a sensor flow above double the pipe's normal flow is suspicious.
 * Ilse only gave "a sensor that suddenly measures more than double the normal flow" as an example;
 * the threshold is not a rule from her.
 */
export const CONFLICT_FACTOR = 2;

/** A sensor with the audit data of its own row (managed aspect). */
export interface SensorSource {
  sensorID: string | null | undefined;
  flowRate: NumericInput;
  modifiedAt: Date | string | null | undefined;
  modifiedBy: string | null | undefined;
}

/** Which sensor disagrees with its pipe, and when/by whom its line was last changed. */
export interface SourceConflictDetail {
  sensorID: string | null;
  sensorFlow: number;
  nominalFlow: number;
  changedAt: string | null;
  changedBy: string | null;
}

/**
 * Names the sensor behind a conflict (the one with the highest flow) and when/by whom its line was
 * last changed. Does not say which source is right. Null when there is no conflict.
 */
export function describeSourceConflict(
  pipeNominalFlow: NumericInput,
  sensors: readonly SensorSource[],
): SourceConflictDetail | null {
  const nominal = toNumber(pipeNominalFlow);
  if (nominal === null || nominal <= 0) return null;
  let worst: { sensor: SensorSource; flow: number } | null = null;
  for (const sensor of sensors) {
    const flow = toNumber(sensor.flowRate);
    if (flow !== null && flow > CONFLICT_FACTOR * nominal && (!worst || flow > worst.flow)) worst = { sensor, flow };
  }
  if (!worst) return null;
  const changedAt = toDate(worst.sensor.modifiedAt);
  return {
    sensorID: worst.sensor.sensorID ?? null,
    sensorFlow: worst.flow,
    nominalFlow: nominal,
    changedAt: changedAt ? changedAt.toISOString() : null,
    changedBy: worst.sensor.modifiedBy ?? null,
  };
}

export function flagSourceConflict(pipeNominalFlow: NumericInput, sensorFlows: readonly NumericInput[]): boolean {
  const nominal = toNumber(pipeNominalFlow);
  if (nominal === null || nominal <= 0) return false;
  return sensorFlows.some((raw) => {
    const flow = toNumber(raw);
    return flow !== null && flow > CONFLICT_FACTOR * nominal;
  });
}
