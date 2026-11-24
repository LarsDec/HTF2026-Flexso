/** Raw numeric value as it can arrive from the database (Decimal columns may come back as strings). */
export type NumericInput = number | string | null | undefined;

/** Finite number, or null when the value is missing / not numeric. */
export function toNumber(value: NumericInput): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Valid Date, or null when the value is missing / not a date. */
export function toDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
