/**
 * Handlers of `FoodStockService` (see `food-stock-service.cds`) — the bakery reorder assistant.
 *
 * The calculation itself lives in srv/domain/food-reorder.ts and the notification rules in
 * srv/domain/food-notifier.ts (both pure and unit-tested next to them). This file only reads the data,
 * calls them, validates the actions and writes the results.
 *
 * `@sap/cds` ships no TypeScript declarations in this project, so it is loaded with `require`
 * and the part of its API used here is described in srv/lib/food-cds-types.ts.
 */
import { randomUUID } from 'node:crypto';
import { markUntrustedRows } from './lib/distrusts';
import type { CdsApi, CdsRequest } from './lib/food-cds-types';
import { formatFixed, toFixed } from './domain/food-decimal';
import { addDays, isIsoDate, isTimeZone, parseClockTime } from './domain/food-calendar';
import { loadConfig, loadPantryItems, loadReorderLines, pantryToday, planInput, type ReorderLine } from './lib/food-pantry-data';
import { runPantryNotifier, startPantryNotifier } from './lib/food-notifier-runner';
import { projectStock } from './domain/food-reorder';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const cds = require('@sap/cds') as CdsApi;
const { SELECT, INSERT, UPDATE } = cds.ql;

const MAX_PROJECTION_DAYS = 60;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The key of the addressed instance: `params` holds `{ ID }` objects or plain key values. */
function keyOf(req: CdsRequest): string | undefined {
  const last = req.params[req.params.length - 1];
  if (typeof last === 'string') return last;
  if (last && typeof last === 'object' && 'ID' in last && typeof last.ID === 'string') return last.ID;
  return undefined;
}

/** "Today" for a request: `?today=YYYY-MM-DD` when given (date picker in the app), else the pantry's date. */
async function todayFor(req: CdsRequest, explicit?: unknown): Promise<{ today: string; realToday: string; config: Awaited<ReturnType<typeof loadConfig>> }> {
  const config = await loadConfig();
  const requested = explicit ?? req.req?.query?.today ?? req.http?.req?.query?.today;
  const realToday = pantryToday(config);
  return { today: isIsoDate(requested) ? requested : realToday, realToday, config };
}

/** READ of ReorderLines / OrderProposals: the whole calculation runs here, nothing is stored. */
async function readLines(req: CdsRequest, onlyToOrder: boolean): Promise<unknown> {
  const { today, realToday, config } = await todayFor(req);
  const id = keyOf(req);
  let lines: ReorderLine[] = await loadReorderLines(today, config.rules, id ? [id] : undefined, realToday);
  if (id) return lines[0] ?? req.reject(404, `Stock item ${id} not found`);
  if (onlyToOrder) {
    lines = lines
      .filter((line) => !line.inHouse && line.orderQuantity !== null && toFixed(line.orderQuantity) > 0n)
      .sort((a, b) => (a.supplierName ?? '').localeCompare(b.supplierName ?? '') || a.name.localeCompare(b.name));
  }
  return Object.assign(lines, { $count: lines.length });
}

function decimalParam(req: CdsRequest, name: string): bigint | undefined {
  const value = req.data[name];
  if (value === undefined || value === null || value === '') return undefined;
  try {
    return toFixed(typeof value === 'number' || typeof value === 'string' ? value : String(value));
  } catch {
    req.reject(400, `${name} must be a number`, name);
  }
}

function integerParam(req: CdsRequest, name: string, min: number, max: number): number | undefined {
  const value = req.data[name];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    req.reject(400, `${name} must be a whole number from ${min} to ${max}`, name);
  }
  return value;
}

function timeParam(req: CdsRequest, name: string): string | undefined {
  const value = req.data[name];
  if (value === undefined || value === null) return undefined;
  const minutes = parseClockTime(value);
  if (minutes === undefined) req.reject(400, `${name} must be a time like 05:00`, name);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00`;
}

export default class FoodStockService extends cds.ApplicationService {
  override async init(): Promise<void> {
    // Marks from the investigation service: "not to be trusted" on stock items.
    this.after('READ', 'StockItems', (results) => markUntrustedRows('StockItems', results));
    this.on('READ', 'ReorderLines', (req) => readLines(req, false));
    this.on('READ', 'OrderProposals', (req) => readLines(req, true));

    // Should 8 — "Mark as ordered": an open order that counts as incoming stock in R2.
    this.on('markAsOrdered', 'ReorderLines', async (req) => {
      const id = keyOf(req);
      const { today, realToday, config } = await todayFor(req);
      const [line] = id ? await loadReorderLines(today, config.rules, [id], realToday) : [];
      if (!line) return req.reject(404, 'Stock item not found');
      if (line.inHouse) return req.reject(400, `${line.name} is made in-house and is never ordered`);
      if (!line.supplierID || line.leadTimeDays === null) return req.reject(400, `${line.name} has no supplier yet`);
      const quantity = decimalParam(req, 'quantity');
      if (quantity === undefined || quantity <= 0n) return req.reject(400, 'Enter a quantity above 0', 'quantity');
      const orderDate = req.data.orderDate ?? today;
      if (!isIsoDate(orderDate)) return req.reject(400, 'Order date must be a date', 'orderDate');

      const order = {
        ID: randomUUID(),
        item_ID: line.ID,
        supplier_ID: line.supplierID,
        quantity: formatFixed(quantity),
        orderDate,
        expectedArrival: addDays(orderDate, line.leadTimeDays),
        status: 'open',
      };
      await INSERT.into('oakhaven.curse.PurchaseOrders').entries(order);
      return SELECT.one.from('FoodStockService.PurchaseOrders').columns('*').where({ ID: order.ID });
    });

    // The delivery arrived: stock goes up, a StockReceivals row records it, the order is closed.
    this.on('markAsReceived', 'PurchaseOrders', async (req) => {
      const id = keyOf(req);
      const order = (await SELECT.one
        .from('FoodStockService.PurchaseOrders')
        .columns('ID', 'item_ID', 'quantity', 'status', 'supplierName')
        .where({ ID: id })) as { ID: string; item_ID: string; quantity: string; status: string; supplierName: string | null } | undefined;
      if (!order) return req.reject(404, 'Order not found');
      if (order.status !== 'open') return req.reject(409, 'This order was already received');
      const receivedAt = `${new Date().toISOString().slice(0, 19)}Z`;
      await UPDATE('oakhaven.curse.StockItems').set({ currentQuantity: { '+=': order.quantity } }).where({ ID: order.item_ID });
      await INSERT.into('oakhaven.curse.StockReceivals').entries({
        item_ID: order.item_ID,
        quantityReceived: order.quantity,
        supplier: order.supplierName,
        receivedAt,
      });
      await UPDATE('oakhaven.curse.PurchaseOrders').set({ status: 'received', receivedAt }).where({ ID: order.ID });
      return SELECT.one.from('FoodStockService.PurchaseOrders').columns('*').where({ ID: order.ID });
    });

    // Must 4 — supplier, critical flag, multiplier, in-house as maintainable data.
    this.on('setReorderAttributes', 'StockItems', async (req) => {
      const supplierID = req.data.supplier_ID;
      const inHouse = req.data.inHouse === true;
      if (supplierID !== undefined && supplierID !== null) {
        const supplier = await SELECT.one.from('oakhaven.curse.Suppliers').columns('ID').where({ ID: supplierID });
        if (!supplier) return req.reject(400, 'Unknown supplier', 'supplier_ID');
      } else if (!inHouse) {
        return req.reject(400, 'An item that is not made in-house needs a supplier', 'supplier_ID');
      }
      const multiplier = decimalParam(req, 'marketDayMultiplier');
      if (multiplier !== undefined && (multiplier < 0n || multiplier > toFixed('10'))) {
        return req.reject(400, 'The market-day multiplier must be between 0 and 10', 'marketDayMultiplier');
      }
      await UPDATE(req.subject).with({
        supplier_ID: inHouse ? null : supplierID,
        isCritical: req.data.isCritical === true,
        inHouse,
        ...(multiplier !== undefined && { marketDayMultiplier: formatFixed(multiplier) }),
      });
      return SELECT.one.from(req.subject).columns('*');
    });

    this.on('updateSupplier', 'Suppliers', async (req) => {
      const name = typeof req.data.name === 'string' ? req.data.name.trim() : undefined;
      if (name === '') return req.reject(400, 'A supplier needs a name', 'name');
      const leadTimeDays = integerParam(req, 'leadTimeDays', 0, MAX_PROJECTION_DAYS);
      await UPDATE(req.subject).with({ ...(name && { name }), ...(leadTimeDays !== undefined && { leadTimeDays }) });
      return SELECT.one.from(req.subject).columns('*');
    });

    // Adding data in the app (team decision, see docs/FOOD-REQUIREMENTS.md).
    this.on('createSupplier', async (req) => {
      const name = typeof req.data.name === 'string' ? req.data.name.trim() : '';
      if (!name) return req.reject(400, 'A supplier needs a name', 'name');
      const leadTimeDays = integerParam(req, 'leadTimeDays', 0, MAX_PROJECTION_DAYS);
      if (leadTimeDays === undefined) return req.reject(400, `leadTimeDays must be a whole number from 0 to ${MAX_PROJECTION_DAYS}`, 'leadTimeDays');
      const names = (await SELECT.from('oakhaven.curse.Suppliers').columns('name')) as { name: string | null }[];
      if (names.some((row) => (row.name ?? '').trim().toLowerCase() === name.toLowerCase())) {
        return req.reject(400, `A supplier named ${name} already exists`, 'name');
      }
      const ID = randomUUID();
      await INSERT.into('oakhaven.curse.Suppliers').entries({ ID, name, leadTimeDays });
      return SELECT.one.from('FoodStockService.Suppliers').columns('*').where({ ID });
    });

    this.on('createStockItem', async (req) => {
      const text = (key: string): string => (typeof req.data[key] === 'string' ? (req.data[key] as string).trim() : '');
      const itemID = text('itemID').toUpperCase();
      if (!itemID) return req.reject(400, 'An item needs an ID', 'itemID');
      if (!/^[A-Z0-9_-]+$/.test(itemID)) return req.reject(400, 'The item ID may only contain A-Z, 0-9, _ and -', 'itemID');
      const name = text('name');
      if (!name) return req.reject(400, 'An item needs a name', 'name');
      const unit = text('unit');
      if (!unit) return req.reject(400, 'An item needs a unit', 'unit');
      const icon = text('icon') || 'sap-icon://ti/package';
      if (!icon.startsWith('sap-icon://')) return req.reject(400, 'The icon must start with sap-icon://', 'icon');
      const quantities: Record<string, bigint> = {};
      for (const key of ['currentQuantity', 'minStockLevel', 'consumptionRate']) {
        const value = decimalParam(req, key);
        if (value === undefined || value < 0n) return req.reject(400, `${key} is required and must be 0 or more`, key);
        quantities[key] = value;
      }
      const multiplier = decimalParam(req, 'marketDayMultiplier') ?? toFixed('1');
      if (multiplier < 0n || multiplier > toFixed('10')) {
        return req.reject(400, 'The market-day multiplier must be between 0 and 10', 'marketDayMultiplier');
      }
      const inHouse = req.data.inHouse === true;
      const supplierID = req.data.supplier_ID;
      if (!inHouse) {
        if (typeof supplierID !== 'string' || !supplierID) return req.reject(400, 'An item that is not made in-house needs a supplier', 'supplier_ID');
        const supplier = await SELECT.one.from('oakhaven.curse.Suppliers').columns('ID').where({ ID: supplierID });
        if (!supplier) return req.reject(400, 'Unknown supplier', 'supplier_ID');
      }
      const existing = await SELECT.one.from('oakhaven.curse.StockItems').columns('ID').where({ itemID });
      if (existing) return req.reject(400, `Item ID ${itemID} already exists`, 'itemID');
      const ID = randomUUID();
      await INSERT.into('oakhaven.curse.StockItems').entries({
        ID,
        itemID,
        name,
        unit,
        icon,
        currentQuantity: formatFixed(quantities.currentQuantity),
        minStockLevel: formatFixed(quantities.minStockLevel),
        consumptionRate: formatFixed(quantities.consumptionRate),
        supplier_ID: inHouse ? null : supplierID,
        isCritical: req.data.isCritical === true,
        marketDayMultiplier: formatFixed(multiplier),
        inHouse,
      });
      return SELECT.one.from('FoodStockService.StockItems').columns('*').where({ ID });
    });

    this.on('updateSettings', 'PantrySettings', async (req) => {
      const timeZone = req.data.timeZone;
      if (timeZone !== undefined && timeZone !== null && !isTimeZone(timeZone)) {
        return req.reject(400, 'Unknown time zone (example: Europe/Brussels)', 'timeZone');
      }
      const email = typeof req.data.recipientEmail === 'string' ? req.data.recipientEmail.trim() : undefined;
      if (email && !EMAIL.test(email)) return req.reject(400, 'Enter a valid e-mail address', 'recipientEmail');
      const changes: Record<string, unknown> = {
        coverDays: integerParam(req, 'coverDays', 0, 60),
        horizonDays: integerParam(req, 'horizonDays', 1, 365),
        marketWeekday: integerParam(req, 'marketWeekday', 0, 6),
        digestTime: timeParam(req, 'digestTime'),
        quietHoursStart: timeParam(req, 'quietHoursStart'),
        quietHoursEnd: timeParam(req, 'quietHoursEnd'),
        timeZone: timeZone ?? undefined,
        recipientEmail: email === undefined ? undefined : email || null,
      };
      await UPDATE(req.subject).with(Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined)));
      return SELECT.one.from(req.subject).columns('*');
    });

    this.on('acknowledge', 'Notifications', async (req) => {
      await UPDATE(req.subject).with({ acknowledged: true });
      return SELECT.one.from(req.subject).columns('*');
    });

    // Should 7 — day-by-day projection of one item.
    this.on('stockProjection', async (req) => {
      const itemId = req.data.item;
      if (typeof itemId !== 'string') return req.reject(400, 'Which item?', 'item');
      const days = integerParam(req, 'days', 1, MAX_PROJECTION_DAYS) ?? 14;
      const { today, realToday, config } = await todayFor(req, req.data.today);
      const [item] = await loadPantryItems([itemId]);
      if (!item) return req.reject(404, 'Stock item not found');
      const minStockLevel = formatFixed(toFixed(item.input.minStockLevel));
      return projectStock(planInput(item.input, today, realToday, config.rules), today, days, config.rules).map((day) => ({ ...day, minStockLevel, unit: item.row.unit }));
    });

    this.on('runNotifier', () => runPantryNotifier());

    startPantryNotifier();
    return super.init();
  }
}
