/**
 * The bakery reorder calculation (BakkerySpec.md, rules R1–R7). Pure functions: no database,
 * no clock — the service passes in the data and "today", so everything here is unit-tested
 * (food-reorder.test.ts).
 *
 * Day 1 is tomorrow. An order placed k days from today with lead time L arrives on day k + L.
 */
import { addDays, weekdayOf } from './food-calendar';
import { ZERO, formatFixed, max, multiply, times, toFixed, type Fixed } from './food-decimal';

/** R4 status. Ranked OK < ORDER_TODAY < LATE ("worse" means a higher rank). */
export type ReorderStatus = 'OK' | 'ORDER_TODAY' | 'LATE';

export const STATUS_RANK: Readonly<Record<ReorderStatus, number>> = { OK: 0, ORDER_TODAY: 1, LATE: 2 };

/** Decimal input as CAP delivers it ("45.00") or as a plain number. */
type DecimalInput = string | number;

/** An open order (marked as ordered, not yet received). */
export interface IncomingOrder {
  readonly quantity: DecimalInput;
  /** YYYY-MM-DD */
  readonly expectedArrival: string;
}

/** Everything the calculation needs to know about one pantry item. */
export interface ReorderItem {
  readonly itemID: string;
  readonly currentQuantity: DecimalInput;
  /** Set by rollForward: the stock as recorded (before forecasting). The data-error flag looks at this one. */
  readonly recordedQuantity?: DecimalInput;
  readonly minStockLevel: DecimalInput;
  /** Use on an ordinary day. */
  readonly consumptionRate: DecimalInput;
  /** Factor on the market day (2 for flour, milk, bread; 1 for the rest). */
  readonly marketDayMultiplier: DecimalInput;
  readonly isCritical: boolean;
  /** Made in-house (bread): shown, never ordered (R6). */
  readonly inHouse: boolean;
  /** Days from order to pantry; null when the item has no supplier. */
  readonly leadTimeDays: number | null;
  readonly incoming: readonly IncomingOrder[];
}

/** The settings that shape the calculation (all configurable, see PantrySettings). */
export interface ReorderRules {
  /** R5: ordinary days of use the order should cover on top of the minimum. */
  readonly coverDays: number;
  /** R3: how many days ahead the order-by date is searched. */
  readonly horizonDays: number;
  /** R1: the market day, 0 = Sunday … 6 = Saturday. */
  readonly marketWeekday: number;
}

export const DEFAULT_RULES: ReorderRules = { coverDays: 7, horizonDays: 60, marketWeekday: 6 };

/** The result for one item. Quantities are exact decimal strings in the item's unit. */
export interface ReorderResult {
  readonly status: ReorderStatus;
  /** Last day an order still arrives in time; null when Late, in-house, or beyond the horizon. */
  readonly orderByDate: string | null;
  /** True when no order is needed within the horizon (R3 "no order needed within 60 days"). */
  readonly noOrderWithinHorizon: boolean;
  /** arrival_stock(0); null for in-house items. */
  readonly arrivalStock: string | null;
  /** R5; null for in-house items (never ordered). */
  readonly orderQuantity: string | null;
  readonly orderable: boolean;
  readonly belowMinimumNow: boolean;
  readonly stockOutRisk: boolean;
  readonly dataError: boolean;
}

/** One day of the stock projection (Should 7). */
export interface ProjectionDay {
  readonly date: string;
  readonly dayNumber: number;
  readonly isMarketDay: boolean;
  readonly use: string;
  readonly incoming: string;
  readonly expectedStock: string;
  readonly belowMinimum: boolean;
}

function isMarketDay(date: string, rules: ReorderRules): boolean {
  return weekdayOf(date) === rules.marketWeekday;
}

/** R1: forecast use on `date`. */
export function forecastUse(item: ReorderItem, date: string, rules: ReorderRules): Fixed {
  const daily = toFixed(item.consumptionRate);
  return isMarketDay(date, rules) ? multiply(daily, toFixed(item.marketDayMultiplier)) : daily;
}

/** Sum of forecast use over days 1 … `lastDay`. */
function useUpTo(item: ReorderItem, today: string, lastDay: number, rules: ReorderRules): Fixed {
  let total = ZERO;
  for (let day = 1; day <= lastDay; day++) total += forecastUse(item, addDays(today, day), rules);
  return total;
}

/** Open orders that are in the pantry by the end of `date` (overdue ones included: not booked yet). */
function incomingBy(item: ReorderItem, date: string): Fixed {
  return item.incoming
    .filter((order) => order.expectedArrival <= date)
    .reduce((sum, order) => sum + toFixed(order.quantity), ZERO);
}

/** In-house items are not delivered: their "lead time" is 0. */
function leadTime(item: ReorderItem): number {
  return item.inHouse ? 0 : item.leadTimeDays ?? 0;
}

/** R2: expected stock on arrival for an order placed `k` days from today. */
export function arrivalStock(item: ReorderItem, today: string, k: number, rules: ReorderRules): Fixed {
  const arrivalDay = k + leadTime(item);
  return toFixed(item.currentQuantity) + incomingBy(item, addDays(today, arrivalDay)) - useUpTo(item, today, arrivalDay, rules);
}

/**
 * Forecast: the item as it would be at the start of `toDate`, rolled forward from `fromDate`.
 * stock = current + open orders arriving in (fromDate, toDate] - forecast use of each day fromDate+1 … toDate
 * (an order arriving on day d counts for day d, like in arrivalStock). Orders in that window are consumed;
 * overdue and later ones stay open. The stock may go negative (a forecast stock-out, not a data error:
 * `recordedQuantity` keeps the recorded value for the data-error flag). A date that is not after `fromDate`
 * returns the item unchanged.
 */
export function rollForward(item: ReorderItem, fromDate: string, toDate: string, rules: ReorderRules): ReorderItem {
  if (toDate <= fromDate) return item;
  let stock = toFixed(item.currentQuantity);
  for (let date = addDays(fromDate, 1); date <= toDate; date = addDays(date, 1)) stock -= forecastUse(item, date, rules);
  const inWindow = (order: IncomingOrder): boolean => order.expectedArrival > fromDate && order.expectedArrival <= toDate;
  for (const order of item.incoming) if (inWindow(order)) stock += toFixed(order.quantity);
  return {
    ...item,
    currentQuantity: formatFixed(stock),
    recordedQuantity: item.recordedQuantity ?? item.currentQuantity,
    incoming: item.incoming.filter((order) => !inWindow(order)),
  };
}

/** R1–R6 for one item on `today`. */
export function computeReorder(item: ReorderItem, today: string, rules: ReorderRules): ReorderResult {
  const min = toFixed(item.minStockLevel);
  const current = toFixed(item.currentQuantity);
  const arrivalToday = arrivalStock(item, today, 0, rules);

  // R3: the order-by date is the last k before the first k whose delivery would arrive under the
  // minimum. (Searching for "the last k that qualifies" could jump over a dip when an open order
  // arrives later; the first failure is the one that matters.)
  let firstFailingK: number | undefined;
  for (let k = 0; k <= rules.horizonDays; k++) {
    if (arrivalStock(item, today, k, rules) < min) {
      firstFailingK = k;
      break;
    }
  }

  // R4
  let status: ReorderStatus;
  let orderByDate: string | null;
  if (firstFailingK === 0) {
    status = 'LATE';
    orderByDate = null;
  } else if (firstFailingK === 1) {
    status = 'ORDER_TODAY';
    orderByDate = today;
  } else {
    status = 'OK';
    orderByDate = firstFailingK === undefined ? null : addDays(today, firstFailingK - 1);
  }

  // R5 + R6
  let orderQuantity: string | null = null;
  if (!item.inHouse) {
    const target = min + times(toFixed(item.consumptionRate), rules.coverDays);
    const needed = status === 'OK' ? ZERO : max(ZERO, target - arrivalToday);
    orderQuantity = formatFixed(needed);
  }

  return {
    status,
    orderByDate: item.inHouse ? null : orderByDate,
    noOrderWithinHorizon: !item.inHouse && firstFailingK === undefined,
    arrivalStock: item.inHouse ? null : formatFixed(arrivalToday),
    orderQuantity,
    orderable: !item.inHouse,
    belowMinimumNow: current < min,
    stockOutRisk: arrivalToday < ZERO,
    dataError: toFixed(item.recordedQuantity ?? item.currentQuantity) < ZERO,
  };
}

/** Day-by-day expected stock for today and the next `days` days (no new order placed). */
export function projectStock(item: ReorderItem, today: string, days: number, rules: ReorderRules): ProjectionDay[] {
  const min = toFixed(item.minStockLevel);
  const result: ProjectionDay[] = [];
  let stock = toFixed(item.currentQuantity) + incomingBy(item, today);
  for (let day = 0; day <= days; day++) {
    const date = addDays(today, day);
    const use = day === 0 ? ZERO : forecastUse(item, date, rules);
    const arriving = day === 0 ? incomingBy(item, today) : incomingBy(item, date) - incomingBy(item, addDays(date, -1));
    if (day > 0) stock += arriving - use;
    result.push({
      date,
      dayNumber: day,
      isMarketDay: isMarketDay(date, rules),
      use: formatFixed(use),
      incoming: formatFixed(arriving),
      expectedStock: formatFixed(stock),
      belowMinimum: stock < min,
    });
  }
  return result;
}
