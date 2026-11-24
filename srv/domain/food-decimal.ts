/**
 * Exact decimal arithmetic for stock quantities (spec rule R7: no floating point).
 *
 * JavaScript numbers are binary floating point, so 0.1 + 0.2 !== 0.3 and a boundary such as
 * "stock on arrival is exactly 10.00" could come out as 9.999999. We therefore store every
 * quantity as a BigInt counted in 1/10 000 of a unit (four decimals). Quantities in the database
 * are Decimal(9, 2), so additions, subtractions and one multiplication of two such values are exact.
 */

/** A quantity in 1/10 000 units. Compare with <, <=, ===; add/subtract with + and -. */
export type Fixed = bigint;

const DECIMALS = 4;
const SCALE = 10n ** BigInt(DECIMALS);

export const ZERO: Fixed = 0n;

/** Parses "45.00", "-3", "0.2", 2.5 … exactly. Throws on anything that is not a plain decimal. */
export function toFixed(value: string | number | bigint | null | undefined): Fixed {
  if (value === null || value === undefined || value === '') return ZERO;
  if (typeof value === 'bigint') return value * SCALE;
  const text = typeof value === 'number' ? String(value) : value.trim();
  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match || (match[2] === '' && (match[3] ?? '') === '')) {
    throw new RangeError(`not a decimal number: ${text}`);
  }
  const [, sign, whole, fraction = ''] = match;
  if (fraction.length > DECIMALS && /[1-9]/.test(fraction.slice(DECIMALS))) {
    throw new RangeError(`more than ${DECIMALS} decimals: ${text}`);
  }
  const digits = BigInt((whole || '0') + fraction.slice(0, DECIMALS).padEnd(DECIMALS, '0'));
  return sign === '-' ? -digits : digits;
}

/** a × b. Exact as long as both factors have at most two decimals (Decimal(9, 2) values). */
export function multiply(a: Fixed, b: Fixed): Fixed {
  return (a * b) / SCALE;
}

/** a × n for a whole number n (days, counts). */
export function times(a: Fixed, n: number): Fixed {
  return a * BigInt(n);
}

export function max(a: Fixed, b: Fixed): Fixed {
  return a > b ? a : b;
}

/** "13.6", "-6", "28.5": shortest exact text, the format CAP accepts for Decimal fields. */
export function formatFixed(value: Fixed): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / SCALE;
  const fraction = (absolute % SCALE).toString().padStart(DECIMALS, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}
