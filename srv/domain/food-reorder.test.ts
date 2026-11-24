/**
 * Business rules R1–R7 of BakkerySpec.md, including acceptance tests A and B (section 6).
 * Run: `npm test`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatFixed, multiply, toFixed } from './food-decimal';
import {
  DEFAULT_RULES,
  arrivalStock,
  computeReorder,
  forecastUse,
  rollForward,
  projectStock,
  type ReorderItem,
} from './food-reorder';

/** Builds an item from the snapshot table of spec 3.1 + suppliers of 3.2 + attributes of 3.3. */
function item(
  itemID: string,
  current: string,
  min: string,
  daily: string,
  leadTimeDays: number | null,
  extra: Partial<ReorderItem> = {},
): ReorderItem {
  return {
    itemID,
    currentQuantity: current,
    minStockLevel: min,
    consumptionRate: daily,
    marketDayMultiplier: '1',
    isCritical: false,
    inHouse: false,
    leadTimeDays,
    incoming: [],
    ...extra,
  };
}

const SNAPSHOT: readonly ReorderItem[] = [
  item('APPLES', '35', '25', '2.5', 7),
  item('BREAD', '35', '20', '5', null, { inHouse: true, marketDayMultiplier: '2' }),
  item('BUTTER', '-3', '12', '1.5', 2, { isCritical: true }),
  item('CHEESE', '12', '8', '1', 7),
  item('EGGS', '5', '12', '1.5', 2),
  item('FLOUR', '40', '45', '6', 3, { isCritical: true, marketDayMultiplier: '2' }),
  item('GRAIN', '45', '30', '4', 3),
  item('MILK', '180', '120', '60', 1, { isCritical: true, marketDayMultiplier: '2' }),
  item('POTATOES', '80', '50', '8', 7),
  item('SALT', '15', '10', '0.2', 7),
];

const TUESDAY = '2026-11-24';

function snapshot(itemID: string): ReorderItem {
  const found = SNAPSHOT.find((i) => i.itemID === itemID);
  assert.ok(found, itemID);
  return found;
}

describe('R7 decimal arithmetic', () => {
  it('is exact where floating point is not', () => {
    assert.equal(formatFixed(toFixed('0.1') + toFixed('0.2')), '0.3');
    assert.equal(formatFixed(toFixed('15') - multiply(toFixed('0.2'), toFixed('25'))), '10');
    assert.equal(formatFixed(toFixed('-3') - toFixed('3')), '-6');
    assert.equal(toFixed('45.00'), toFixed(45));
  });

  it('rejects text that is not a number', () => {
    assert.throws(() => toFixed('12kg'), RangeError);
  });
});

describe('R1 forecast daily use', () => {
  it('multiplies only on Saturday', () => {
    const flour = snapshot('FLOUR');
    assert.equal(formatFixed(forecastUse(flour, '2026-11-27', DEFAULT_RULES)), '6'); // Friday
    assert.equal(formatFixed(forecastUse(flour, '2026-11-28', DEFAULT_RULES)), '12'); // Saturday
    assert.equal(formatFixed(forecastUse(snapshot('GRAIN'), '2026-11-28', DEFAULT_RULES)), '4'); // multiplier 1
  });
});

describe('R2 expected stock on arrival', () => {
  it('subtracts the use of days 1 … k+L', () => {
    // Flour, k = 1, L = 3 → days 1–4, day 4 is Saturday: 6 + 6 + 6 + 12 = 30 → 40 − 30 = 10
    assert.equal(formatFixed(arrivalStock(snapshot('FLOUR'), TUESDAY, 1, DEFAULT_RULES)), '10');
  });

  it('adds open orders that arrive by then, and only those', () => {
    const grain = item('GRAIN', '45', '30', '4', 3, {
      incoming: [
        { quantity: '20', expectedArrival: '2026-11-27' }, // day 3: counts for k = 0
        { quantity: '100', expectedArrival: '2026-11-28' }, // day 4: only from k = 1
      ],
    });
    assert.equal(formatFixed(arrivalStock(grain, TUESDAY, 0, DEFAULT_RULES)), '53');
    assert.equal(formatFixed(arrivalStock(grain, TUESDAY, 1, DEFAULT_RULES)), '149');
  });

  it('keeps counting an overdue open order (it is not booked into stock yet)', () => {
    const grain = item('GRAIN', '45', '30', '4', 3, { incoming: [{ quantity: '10', expectedArrival: '2026-11-20' }] });
    assert.equal(formatFixed(arrivalStock(grain, TUESDAY, 0, DEFAULT_RULES)), '43');
  });
});

describe('Test A — snapshot of Tuesday 2026-11-24, order placed today', () => {
  const expected = [
    { id: 'MILK', arrival: '120', status: 'ORDER_TODAY', qty: '420', below: false, stockOut: false, dataError: false },
    { id: 'GRAIN', arrival: '33', status: 'ORDER_TODAY', qty: '25', below: false, stockOut: false, dataError: false },
    { id: 'FLOUR', arrival: '22', status: 'LATE', qty: '65', below: true, stockOut: false, dataError: false },
    // The spec row omits "below minimum now" for Butter, but −3 < 12 — see the summary.
    { id: 'BUTTER', arrival: '-6', status: 'LATE', qty: '28.5', below: true, stockOut: true, dataError: true },
    { id: 'EGGS', arrival: '2', status: 'LATE', qty: '20.5', below: true, stockOut: false, dataError: false },
    { id: 'APPLES', arrival: '17.5', status: 'LATE', qty: '25', below: false, stockOut: false, dataError: false },
    { id: 'CHEESE', arrival: '5', status: 'LATE', qty: '10', below: false, stockOut: false, dataError: false },
    { id: 'POTATOES', arrival: '24', status: 'LATE', qty: '82', below: false, stockOut: false, dataError: false },
    { id: 'SALT', arrival: '13.6', status: 'OK', qty: '0', below: false, stockOut: false, dataError: false },
  ] as const;

  for (const row of expected) {
    it(`${row.id}: ${row.status}, arrival ${row.arrival}, order ${row.qty}`, () => {
      const result = computeReorder(snapshot(row.id), TUESDAY, DEFAULT_RULES);
      assert.equal(result.arrivalStock, row.arrival);
      assert.equal(result.status, row.status);
      assert.equal(result.orderQuantity, row.qty);
      assert.equal(result.belowMinimumNow, row.below);
      assert.equal(result.stockOutRisk, row.stockOut);
      assert.equal(result.dataError, row.dataError);
      assert.equal(result.orderable, true);
    });
  }

  it('Milk and Grain must be ordered today', () => {
    assert.equal(computeReorder(snapshot('MILK'), TUESDAY, DEFAULT_RULES).orderByDate, TUESDAY);
    assert.equal(computeReorder(snapshot('GRAIN'), TUESDAY, DEFAULT_RULES).orderByDate, TUESDAY);
  });

  it('Late items have no order-by date (R3 reading agreed with the team)', () => {
    const flour = computeReorder(snapshot('FLOUR'), TUESDAY, DEFAULT_RULES);
    assert.equal(flour.orderByDate, null);
    assert.equal(flour.noOrderWithinHorizon, false);
  });

  it('Salt is OK with order-by 2026-12-12: the exact boundary (arrival = min) still counts (R7)', () => {
    const salt = computeReorder(snapshot('SALT'), TUESDAY, DEFAULT_RULES);
    assert.equal(salt.orderByDate, '2026-12-12');
    assert.equal(formatFixed(arrivalStock(snapshot('SALT'), TUESDAY, 18, DEFAULT_RULES)), '10');
    assert.equal(formatFixed(arrivalStock(snapshot('SALT'), TUESDAY, 19, DEFAULT_RULES)), '9.8');
  });

  it('Bread is in-house: never an order (R6), no arrival stock, still a status', () => {
    const bread = computeReorder(snapshot('BREAD'), TUESDAY, DEFAULT_RULES);
    assert.equal(bread.orderable, false);
    assert.equal(bread.orderQuantity, null);
    assert.equal(bread.arrivalStock, null);
    assert.equal(bread.orderByDate, null);
    assert.equal(bread.status, 'OK');
  });

  it('Bread gets no order even when it runs low', () => {
    const bread = computeReorder(item('BREAD', '1', '20', '5', null, { inHouse: true }), TUESDAY, DEFAULT_RULES);
    assert.equal(bread.status, 'LATE');
    assert.equal(bread.orderQuantity, null);
  });
});

describe('Test B — the Saturday rule', () => {
  const flour = item('FLOUR', '100', '45', '6', 3, { isCritical: true, marketDayMultiplier: '2' });

  it('order-by is Monday 2026-11-30 when today is Wednesday 2026-11-25', () => {
    const result = computeReorder(flour, '2026-11-25', DEFAULT_RULES);
    assert.equal(result.orderByDate, '2026-11-30');
    assert.equal(result.status, 'OK');
  });

  it('without the multiplier it would be Tuesday 2026-12-01', () => {
    const result = computeReorder({ ...flour, marketDayMultiplier: '1' }, '2026-11-25', DEFAULT_RULES);
    assert.equal(result.orderByDate, '2026-12-01');
  });

  it('the market day is a setting, not hard-coded', () => {
    const fridayMarket = { ...DEFAULT_RULES, marketWeekday: 5 };
    assert.equal(formatFixed(forecastUse(flour, '2026-11-27', fridayMarket)), '12'); // Friday
    assert.equal(formatFixed(forecastUse(flour, '2026-11-28', fridayMarket)), '6'); // Saturday
  });
});

describe('R3 search window', () => {
  it('says "no order needed" when the stock lasts beyond the 60-day horizon', () => {
    const result = computeReorder(item('SALT', '500', '10', '0.2', 7), TUESDAY, DEFAULT_RULES);
    assert.equal(result.status, 'OK');
    assert.equal(result.orderByDate, null);
    assert.equal(result.noOrderWithinHorizon, true);
    assert.equal(result.orderQuantity, '0');
  });

  it('never skips a dip: an order arriving later does not move the order-by date past the shortage', () => {
    // Without orders: order-by = today + 2 (k = 3 fails). A big order arriving on day 10 would make
    // k = 7…  pass again, but the dip at k = 3 still comes first.
    const grain = item('GRAIN', '53', '30', '4', 3, { incoming: [{ quantity: '100', expectedArrival: '2026-12-04' }] });
    assert.equal(computeReorder(grain, TUESDAY, DEFAULT_RULES).orderByDate, '2026-11-26');
  });
});

describe('R5 recommended order quantity', () => {
  it('uses the configurable cover days and ignores the Saturday multiplier', () => {
    const milk = snapshot('MILK');
    assert.equal(computeReorder(milk, TUESDAY, { ...DEFAULT_RULES, coverDays: 3 }).orderQuantity, '180'); // 120+180−120
  });

  it('is never negative (Order today with a small cover)', () => {
    // L = 3 from Tuesday: day 4 (Saturday, ×2) is the day that makes ordering tomorrow too late.
    // arrival(0) = 95 − 30 = 65 ≥ 50, arrival(1) = 95 − 50 = 45 < 50 → Order today.
    // target with 1 cover day = 50 + 10 = 60 < 65 → max(0, −5) = 0.
    const odd = item('ODD', '95', '50', '10', 3, { marketDayMultiplier: '2' });
    const result = computeReorder(odd, TUESDAY, { ...DEFAULT_RULES, coverDays: 1 });
    assert.equal(result.status, 'ORDER_TODAY');
    assert.equal(result.orderQuantity, '0');
  });

  it('is 0 for OK items', () => {
    assert.equal(computeReorder(snapshot('SALT'), TUESDAY, DEFAULT_RULES).orderQuantity, '0');
  });
});

describe('Projection (Should 7)', () => {
  it('lists 14 days with market days and the minimum', () => {
    const days = projectStock(snapshot('FLOUR'), TUESDAY, 14, DEFAULT_RULES);
    assert.equal(days.length, 15); // today + 14
    assert.deepEqual(days[0], {
      date: TUESDAY,
      dayNumber: 0,
      isMarketDay: false,
      use: '0',
      incoming: '0',
      expectedStock: '40',
      belowMinimum: true,
    });
    assert.equal(days[4].date, '2026-11-28');
    assert.equal(days[4].isMarketDay, true);
    assert.equal(days[4].use, '12');
    assert.equal(days[4].expectedStock, '10');
  });
});

describe('Forecast: roll the stock forward to a picked date', () => {
  const milk = (): ReorderItem => snapshot('MILK');

  it('Milk picked Thursday: stock 60, Late, order 540', () => {
    const rolled = rollForward(milk(), TUESDAY, '2026-11-26', DEFAULT_RULES);
    assert.equal(formatFixed(toFixed(rolled.currentQuantity)), '60');
    const result = computeReorder(rolled, '2026-11-26', DEFAULT_RULES);
    assert.equal(result.status, 'LATE');
    assert.equal(result.arrivalStock, '0');
    assert.equal(result.orderQuantity, '540');
  });

  it('uses the market-day multiplier when the window crosses the market day', () => {
    const flour = item('FLOUR', '100', '45', '6', 3, { marketDayMultiplier: '2' });
    const rolled = rollForward(flour, '2026-11-26', '2026-11-29', DEFAULT_RULES);
    assert.equal(formatFixed(toFixed(rolled.currentQuantity)), '76');
  });

  it('adds an order arriving in the window and no longer counts it; later orders still count', () => {
    const base = item('MILK', '100', '120', '60', 1, {
      incoming: [
        { quantity: '300', expectedArrival: '2026-11-26' },
        { quantity: '50', expectedArrival: '2026-11-28' },
      ],
    });
    const rolled = rollForward(base, TUESDAY, '2026-11-26', DEFAULT_RULES);
    assert.equal(formatFixed(toFixed(rolled.currentQuantity)), '280'); // 100 - 60 - 60 + 300
    assert.deepEqual(rolled.incoming, [{ quantity: '50', expectedArrival: '2026-11-28' }]);
    // R2 from the picked date: day 1 Fri -60, day 2 Sat (market x2) -120, +50 arriving Sat
    assert.equal(formatFixed(arrivalStock(rolled, '2026-11-26', 2, DEFAULT_RULES)), '150'); // 280 + 50 - 60 - 120
  });

  it('an order arriving today (day 0) is not added again; overdue orders stay open', () => {
    const base = item('MILK', '100', '10', '1', 1, {
      incoming: [{ quantity: '30', expectedArrival: TUESDAY }, { quantity: '5', expectedArrival: '2026-11-20' }],
    });
    const rolled = rollForward(base, TUESDAY, '2026-11-25', DEFAULT_RULES);
    assert.equal(formatFixed(toFixed(rolled.currentQuantity)), '99');
    assert.equal(rolled.incoming.length, 2);
  });

  it('the same or an earlier date changes nothing', () => {
    for (const date of [TUESDAY, '2026-11-20']) {
      const rolled = rollForward(milk(), TUESDAY, date, DEFAULT_RULES);
      assert.deepEqual(computeReorder(rolled, date, DEFAULT_RULES), computeReorder(milk(), date, DEFAULT_RULES));
      assert.equal(rolled.recordedQuantity, undefined);
    }
  });

  it('positive recorded stock but negative forecast: stock-out risk, no data error', () => {
    const rolled = rollForward(item('MILK', '50', '10', '60', 1), TUESDAY, '2026-11-26', DEFAULT_RULES);
    assert.equal(formatFixed(toFixed(rolled.currentQuantity)), '-70');
    const result = computeReorder(rolled, '2026-11-26', DEFAULT_RULES);
    assert.equal(result.dataError, false);
    assert.equal(result.stockOutRisk, true);
    assert.equal(result.belowMinimumNow, true);
  });

  it('a recorded negative stock stays a data error after rolling', () => {
    const rolled = rollForward(snapshot('BUTTER'), TUESDAY, '2026-11-26', DEFAULT_RULES);
    assert.equal(computeReorder(rolled, '2026-11-26', DEFAULT_RULES).dataError, true);
  });
});
