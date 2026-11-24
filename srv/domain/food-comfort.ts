/**
 * Tobin's comfort levels for a stock item (T-Q10, T-Q11). Pure: no @sap/cds, no I/O.
 *
 * Below the minimum = "nervous"; below half of the minimum = "real panic". Strict comparisons
 * ("exactly the minimum" is fine, "exactly half" is still nervous) and exact decimals, no floats.
 */
import { toFixed } from './food-decimal';

export type ComfortLevel = 'fine' | 'nervous' | 'panic';

export function comfortLevel(current: string | number, minimum: string | number): ComfortLevel {
  const stock = toFixed(current);
  const min = toFixed(minimum);
  if (min <= 0n) return 'fine';
  if (2n * stock < min) return 'panic';
  if (stock < min) return 'nervous';
  return 'fine';
}
