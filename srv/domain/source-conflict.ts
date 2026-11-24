/**
 * Flags sources that disagree. Only marks the conflict; it does not decide which source is right.
 */
import { toNumber, type NumericInput } from './numbers';

/**
 * Our own team heuristic: a sensor flow above double the pipe's normal flow is suspicious.
 * Ilse only gave "a sensor that suddenly measures more than double the normal flow" as an example;
 * the threshold is not a rule from her.
 */
export const CONFLICT_FACTOR = 2;

export function flagSourceConflict(pipeNominalFlow: NumericInput, sensorFlows: readonly NumericInput[]): boolean {
  const nominal = toNumber(pipeNominalFlow);
  if (nominal === null || nominal <= 0) return false;
  return sensorFlows.some((raw) => {
    const flow = toNumber(raw);
    return flow !== null && flow > CONFLICT_FACTOR * nominal;
  });
}
