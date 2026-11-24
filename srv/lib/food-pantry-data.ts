/**
 * Loads the pantry from the database and runs the reorder calculation on it. Shared by the
 * FoodStockService READ handlers and the background notifier, so both always agree.
 *
 * Three queries per call (settings, items with supplier, open orders) — never one per item.
 */
import type { CdsApi } from './food-cds-types';
import { isTimeZone, localTimeIn, parseClockTime } from '../domain/food-calendar';
import type { NotifierSettings } from '../domain/food-notifier';
import {
  DEFAULT_RULES,
  STATUS_RANK,
  computeReorder,
  rollForward,
  type IncomingOrder,
  type ReorderItem,
  type ReorderRules,
  type ReorderStatus,
} from '../domain/food-reorder';
import { formatFixed, toFixed } from '../domain/food-decimal';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const cds = require('@sap/cds') as CdsApi;
const { SELECT } = cds.ql;

export const SETTINGS_ID = '70000000-0000-4000-8000-000000000001';

const DEFAULT_NOTIFIER: NotifierSettings = {
  timeZone: 'Europe/Brussels',
  digestMinutes: 5 * 60,
  quietStartMinutes: 20 * 60,
  quietEndMinutes: 5 * 60,
};

interface SettingsRow {
  coverDays: number | null;
  horizonDays: number | null;
  marketWeekday: number | null;
  digestTime: string | null;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timeZone: string | null;
  recipientEmail: string | null;
}

export interface PantryConfig {
  readonly rules: ReorderRules;
  readonly notifier: NotifierSettings;
  readonly recipientEmail: string | null;
}

/** The settings row, with defaults for anything missing or invalid. */
export async function loadConfig(): Promise<PantryConfig> {
  const row = (await SELECT.one
    .from('oakhaven.curse.PantrySettings')
    .columns('coverDays', 'horizonDays', 'marketWeekday', 'digestTime', 'quietHoursStart', 'quietHoursEnd', 'timeZone', 'recipientEmail')
    .where({ ID: SETTINGS_ID })) as SettingsRow | undefined;
  return {
    rules: {
      coverDays: row?.coverDays ?? DEFAULT_RULES.coverDays,
      horizonDays: row?.horizonDays ?? DEFAULT_RULES.horizonDays,
      marketWeekday: row?.marketWeekday ?? DEFAULT_RULES.marketWeekday,
    },
    notifier: {
      timeZone: isTimeZone(row?.timeZone) ? row.timeZone : DEFAULT_NOTIFIER.timeZone,
      digestMinutes: parseClockTime(row?.digestTime) ?? DEFAULT_NOTIFIER.digestMinutes,
      quietStartMinutes: parseClockTime(row?.quietHoursStart) ?? DEFAULT_NOTIFIER.quietStartMinutes,
      quietEndMinutes: parseClockTime(row?.quietHoursEnd) ?? DEFAULT_NOTIFIER.quietEndMinutes,
    },
    recipientEmail: row?.recipientEmail?.trim() || null,
  };
}

/** Today's date on the pantry's clock. */
export function pantryToday(config: PantryConfig, now: Date = new Date()): string {
  return localTimeIn(now, config.notifier.timeZone).date;
}

interface ItemRow {
  ID: string;
  itemID: string;
  name: string;
  unit: string;
  icon: string | null;
  currentQuantity: string | number | null;
  minStockLevel: string | number | null;
  consumptionRate: string | number | null;
  isCritical: boolean | null;
  inHouse: boolean | null;
  marketDayMultiplier: string | number | null;
  supplierID: string | null;
  supplierName: string | null;
  leadTimeDays: number | null;
}

interface OrderRow {
  item_ID: string;
  quantity: string | number;
  expectedArrival: string;
}

/** A ReorderLines row as the service returns it (see food-stock-service.cds). */
export interface ReorderLine {
  readonly ID: string;
  readonly itemID: string;
  readonly name: string;
  readonly unit: string;
  readonly icon: string | null;
  readonly currentQuantity: string;
  readonly minStockLevel: string;
  readonly consumptionRate: string;
  readonly isCritical: boolean;
  readonly inHouse: boolean;
  readonly marketDayMultiplier: string;
  readonly supplierID: string | null;
  readonly supplierName: string | null;
  readonly leadTimeDays: number | null;
  readonly today: string;
  /** Stock at the start of `today`: the recorded stock, or the forecast when `today` is after the real today. */
  readonly forecastStock: string;
  readonly isForecast: boolean;
  readonly status: ReorderStatus;
  readonly arrivalStock: string | null;
  readonly orderByDate: string | null;
  readonly noOrderWithinHorizon: boolean;
  readonly horizonDays: number;
  readonly orderQuantity: string | null;
  readonly belowMinimumNow: boolean;
  readonly stockOutRisk: boolean;
  readonly dataError: boolean;
  readonly openOrderQuantity: string;
  readonly nextArrival: string | null;
  readonly sortRank: number;
}

/** The input of the calculation for one item, plus its database row. */
export interface PantryItem {
  readonly row: ItemRow;
  readonly input: ReorderItem;
}

function decimalText(value: string | number | null, fallback = '0'): string {
  return formatFixed(toFixed(value ?? fallback));
}

/** Reads items (optionally only `ids`) with supplier and open orders. */
export async function loadPantryItems(ids?: readonly string[]): Promise<PantryItem[]> {
  let itemQuery = SELECT.from('oakhaven.curse.StockItems').columns(
    'ID', 'itemID', 'name', 'unit', 'icon', 'currentQuantity', 'minStockLevel', 'consumptionRate',
    'isCritical', 'inHouse', 'marketDayMultiplier',
    'supplier.ID as supplierID', 'supplier.name as supplierName', 'supplier.leadTimeDays as leadTimeDays',
  );
  if (ids) itemQuery = itemQuery.where({ ID: { in: ids } });
  const items = (await itemQuery) as ItemRow[];
  if (items.length === 0) return [];

  const orders = (await SELECT.from('oakhaven.curse.PurchaseOrders')
    .columns('item_ID', 'quantity', 'expectedArrival')
    .where({ status: 'open', item_ID: { in: items.map((i) => i.ID) } })) as OrderRow[];
  const ordersByItem = new Map<string, IncomingOrder[]>();
  for (const order of orders) {
    const list = ordersByItem.get(order.item_ID) ?? [];
    list.push({ quantity: order.quantity, expectedArrival: order.expectedArrival });
    ordersByItem.set(order.item_ID, list);
  }

  return items.map((row) => ({
    row,
    input: {
      itemID: row.itemID,
      currentQuantity: row.currentQuantity ?? '0',
      minStockLevel: row.minStockLevel ?? '0',
      consumptionRate: row.consumptionRate ?? '0',
      marketDayMultiplier: row.marketDayMultiplier ?? '1',
      isCritical: row.isCritical === true,
      inHouse: row.inHouse === true,
      leadTimeDays: row.leadTimeDays,
      incoming: ordersByItem.get(row.ID) ?? [],
    },
  }));
}

/** The item as the plan sees it on `today`: rolled forward from `realToday` when `today` lies after it. */
export function planInput(input: ReorderItem, today: string, realToday: string | undefined, rules: ReorderRules): ReorderItem {
  return realToday === undefined ? input : rollForward(input, realToday, today, rules);
}

/** Runs R1–R6 for one loaded item. Pass `realToday` to forecast when `today` is after it. */
export function toReorderLine(item: PantryItem, today: string, rules: ReorderRules, realToday?: string): ReorderLine {
  const { row } = item;
  const input = planInput(item.input, today, realToday, rules);
  const isForecast = realToday !== undefined && today > realToday;
  const result = computeReorder(input, today, rules);
  const openOrderQuantity = input.incoming.reduce((sum, o) => sum + toFixed(o.quantity), 0n);
  const nextArrival = input.incoming.map((o) => o.expectedArrival).sort()[0] ?? null;
  return {
    ID: row.ID,
    itemID: row.itemID,
    name: row.name,
    unit: row.unit,
    icon: row.icon,
    currentQuantity: decimalText(row.currentQuantity),
    minStockLevel: decimalText(row.minStockLevel),
    consumptionRate: decimalText(row.consumptionRate),
    isCritical: input.isCritical,
    inHouse: input.inHouse,
    marketDayMultiplier: decimalText(row.marketDayMultiplier, '1'),
    supplierID: row.supplierID,
    supplierName: row.supplierName,
    leadTimeDays: row.leadTimeDays,
    today,
    forecastStock: decimalText(input.currentQuantity),
    isForecast,
    status: result.status,
    arrivalStock: result.arrivalStock,
    orderByDate: result.orderByDate,
    noOrderWithinHorizon: result.noOrderWithinHorizon,
    horizonDays: rules.horizonDays,
    orderQuantity: result.orderQuantity,
    belowMinimumNow: result.belowMinimumNow,
    stockOutRisk: result.stockOutRisk,
    dataError: result.dataError,
    openOrderQuantity: formatFixed(openOrderQuantity),
    nextArrival,
    // Default order (spec Must 2): critical first, then Late → Order today → OK; name breaks ties in compareLines.
    sortRank: (input.isCritical ? 0 : 10) + (2 - STATUS_RANK[result.status]),
  };
}

/** Critical first, worst status first, then by name. */
export function compareLines(a: ReorderLine, b: ReorderLine): number {
  return a.sortRank - b.sortRank || a.name.localeCompare(b.name);
}

/** All reorder lines (or those of `ids`) for `today`, in the default order. */
export async function loadReorderLines(
  today: string,
  rules: ReorderRules,
  ids?: readonly string[],
  realToday?: string,
): Promise<ReorderLine[]> {
  const items = await loadPantryItems(ids);
  return items.map((item) => toReorderLine(item, today, rules, realToday)).sort(compareLines);
}
