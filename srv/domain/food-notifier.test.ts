/**
 * Notification rules N1–N7 of BakkerySpec.md, including acceptance test C (section 6).
 * The engine is a pure function: we hand it the clock, the current statuses and the stored state.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  planNotifications,
  type NotifiedState,
  type NotifierSettings,
  type NotifierSnapshot,
  type TrackedItem,
} from './food-notifier';
import type { ReorderStatus } from './food-reorder';

/** Clock in UTC to keep the tests readable; one test checks the time zone handling. */
const SETTINGS: NotifierSettings = {
  timeZone: 'UTC',
  digestMinutes: 5 * 60,
  quietStartMinutes: 20 * 60,
  quietEndMinutes: 5 * 60,
};

const ITEMS: Readonly<Record<string, Omit<TrackedItem, 'status' | 'dataError'>>> = {
  FLOUR: { itemID: 'FLOUR', name: 'Flour', unit: 'KG', isCritical: true, inHouse: false, orderByDate: null, orderQuantity: '65', supplierName: 'North Mill' },
  MILK: { itemID: 'MILK', name: 'Milk', unit: 'L', isCritical: true, inHouse: false, orderByDate: '2026-11-24', orderQuantity: '420', supplierName: 'Local Dairy Farm' },
  BUTTER: { itemID: 'BUTTER', name: 'Butter', unit: 'KG', isCritical: true, inHouse: false, orderByDate: null, orderQuantity: '28.5', supplierName: 'South Meadow Farms' },
  CHEESE: { itemID: 'CHEESE', name: 'Cheese', unit: 'KG', isCritical: false, inHouse: false, orderByDate: null, orderQuantity: '10', supplierName: 'Travelling merchant' },
  APPLES: { itemID: 'APPLES', name: 'Apples', unit: 'KG', isCritical: false, inHouse: false, orderByDate: null, orderQuantity: '25', supplierName: 'Travelling merchant' },
  BREAD: { itemID: 'BREAD', name: 'Bread', unit: 'Number', isCritical: false, inHouse: true, orderByDate: null, orderQuantity: null, supplierName: null },
};

type Statuses = Partial<Record<keyof typeof ITEMS, ReorderStatus | [ReorderStatus, boolean]>>;

/** Every item OK unless overridden; [status, dataError] sets the data-error flag too. */
function pantry(overrides: Statuses = {}): TrackedItem[] {
  return Object.values(ITEMS).map((base) => {
    const value = overrides[base.itemID] ?? 'OK';
    const [status, dataError] = Array.isArray(value) ? value : [value, false];
    return { ...base, status, dataError };
  });
}

/** Test C start: all items OK and already notified, today's 05:00 digest already sent. */
function startState(overrides: Partial<Record<string, ReorderStatus>> = {}): NotifierSnapshot {
  const states: NotifiedState[] = Object.values(ITEMS)
    .filter((i) => !i.inHouse)
    .map((i) => ({ itemID: i.itemID, status: overrides[i.itemID] ?? 'OK', dataError: false, lastImmediateAt: null }));
  return { states, lastDigestDate: '2026-11-24' };
}

/** Runs the engine for a sequence of (time, pantry) steps and collects every message. */
function run(start: NotifierSnapshot, steps: ReadonlyArray<[string, TrackedItem[]]>) {
  let snapshot = start;
  const messages: { at: string; kind: string; subject: string; body: string; worse: string[]; better: string[] }[] = [];
  for (const [at, items] of steps) {
    const plan = planNotifications(new Date(at), items, snapshot, SETTINGS);
    snapshot = plan.snapshot;
    for (const m of plan.messages) {
      messages.push({
        at,
        kind: m.kind,
        subject: m.subject,
        body: m.body,
        worse: m.entries.filter((e) => e.direction === 'worse').map((e) => e.itemID),
        better: m.entries.filter((e) => e.direction === 'better').map((e) => e.itemID),
      });
    }
  }
  return { messages, snapshot };
}

describe('Test C — notifications (digest at 05:00, all items start OK and notified)', () => {
  it('1. critical Flour OK → Late at 10:00 sends an immediate message; Late → Order today → Late sends nothing more', () => {
    const { messages } = run(startState(), [
      ['2026-11-24T10:00:00Z', pantry({ FLOUR: 'LATE' })],
      ['2026-11-24T12:00:00Z', pantry({ FLOUR: 'ORDER_TODAY' })],
      ['2026-11-24T14:00:00Z', pantry({ FLOUR: 'LATE' })],
      ['2026-11-25T05:00:00Z', pantry({ FLOUR: 'LATE' })],
    ]);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].kind, 'immediate');
    assert.equal(messages[0].at, '2026-11-24T10:00:00Z');
    assert.deepEqual(messages[0].worse, ['FLOUR']);
  });

  it('2. non-critical Cheese OK → Late at 10:00 waits for the next 05:00 digest ("Got worse")', () => {
    const { messages } = run(startState(), [
      ['2026-11-24T10:00:00Z', pantry({ CHEESE: 'LATE' })],
      ['2026-11-25T04:59:00Z', pantry({ CHEESE: 'LATE' })],
      ['2026-11-25T05:00:00Z', pantry({ CHEESE: 'LATE' })],
    ]);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].kind, 'digest');
    assert.equal(messages[0].at, '2026-11-25T05:00:00Z');
    assert.deepEqual(messages[0].worse, ['CHEESE']);
    assert.deepEqual(messages[0].better, []);
  });

  it('3. Apples OK → Order today → OK between two digests: nothing is sent (N4)', () => {
    const { messages } = run(startState(), [
      ['2026-11-24T10:00:00Z', pantry({ APPLES: 'ORDER_TODAY' })],
      ['2026-11-24T15:00:00Z', pantry()],
      ['2026-11-25T05:00:00Z', pantry()],
    ]);
    assert.equal(messages.length, 0);
  });

  it('4. Milk was Late and is refilled to OK: the next digest lists it under "Fine again"', () => {
    const { messages } = run(startState({ MILK: 'LATE' }), [['2026-11-25T05:00:00Z', pantry()]]);
    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0].better, ['MILK']);
    assert.match(messages[0].subject, /1 fine again/);
  });

  it('5. a day without status changes sends no message at all (N5)', () => {
    const { messages, snapshot } = run(startState(), [
      ['2026-11-24T12:00:00Z', pantry()],
      ['2026-11-25T05:00:00Z', pantry()],
    ]);
    assert.equal(messages.length, 0);
    assert.equal(snapshot.lastDigestDate, '2026-11-25');
  });

  it('6. Butter OK → Late at 22:00 (quiet hours): no immediate message, it is in the 05:00 digest', () => {
    const { messages } = run(startState(), [
      ['2026-11-24T22:00:00Z', pantry({ BUTTER: 'LATE' })],
      ['2026-11-25T03:00:00Z', pantry({ BUTTER: 'LATE' })],
      ['2026-11-25T05:00:00Z', pantry({ BUTTER: 'LATE' })],
      ['2026-11-25T05:01:00Z', pantry({ BUTTER: 'LATE' })],
    ]);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].kind, 'digest');
    assert.deepEqual(messages[0].worse, ['BUTTER']);
  });
});

describe('N1 only on status change', () => {
  it('a data error appearing is worse, clearing it is fine again', () => {
    const appear = run(startState(), [['2026-11-25T05:00:00Z', pantry({ CHEESE: ['OK', true] })]]);
    assert.deepEqual(appear.messages[0].worse, ['CHEESE']);
    assert.match(appear.messages[0].body, /data error/i);

    const clear = run(appear.snapshot, [['2026-11-26T05:00:00Z', pantry()]]);
    assert.deepEqual(clear.messages[0].better, ['CHEESE']);
  });

  it('a better status with a new data error counts as worse', () => {
    const { messages } = run(startState({ CHEESE: 'LATE' }), [['2026-11-25T05:00:00Z', pantry({ CHEESE: ['OK', true] })]]);
    assert.deepEqual(messages[0].worse, ['CHEESE']);
  });

  it('never notifies in-house items (Bread)', () => {
    const { messages } = run(startState(), [['2026-11-25T05:00:00Z', pantry({ BREAD: 'LATE' })]]);
    assert.equal(messages.length, 0);
  });
});

describe('N2 daily digest', () => {
  it('is one message with counts, "Got worse" and "Fine again" sections, critical items first', () => {
    const { messages } = run(startState({ MILK: 'LATE' }), [
      ['2026-11-25T05:00:00Z', pantry({ CHEESE: 'LATE', APPLES: 'ORDER_TODAY', BUTTER: 'ORDER_TODAY' })],
    ]);
    assert.equal(messages.length, 1);
    const [digest] = messages;
    assert.equal(digest.subject, 'Pantry: 3 worse, 1 fine again');
    assert.deepEqual(digest.worse, ['BUTTER', 'CHEESE', 'APPLES']);
    assert.ok(digest.body.indexOf('Got worse') < digest.body.indexOf('Fine again'));
  });

  it('is sent once per day, also when the server was down at 05:00 (catch-up)', () => {
    const { messages } = run(startState(), [
      ['2026-11-25T07:30:00Z', pantry({ CHEESE: 'LATE' })],
      ['2026-11-25T08:30:00Z', pantry({ CHEESE: 'LATE', APPLES: 'LATE' })],
    ]);
    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0].worse, ['CHEESE']);
  });

  it('uses the configured time zone (05:00 Brussels = 04:00 UTC in winter)', () => {
    const brussels = { ...SETTINGS, timeZone: 'Europe/Brussels' };
    const before = planNotifications(new Date('2026-11-25T03:59:00Z'), pantry({ CHEESE: 'LATE' }), startState(), brussels);
    assert.equal(before.messages.length, 0);
    const at = planNotifications(new Date('2026-11-25T04:00:00Z'), pantry({ CHEESE: 'LATE' }), startState(), brussels);
    assert.equal(at.messages.length, 1);
  });
});

describe('N3 immediate exception', () => {
  it('only for critical items becoming Late, at most once per item per 24 hours', () => {
    const { messages } = run(startState(), [
      ['2026-11-24T10:00:00Z', pantry({ FLOUR: 'LATE' })], // immediate
      ['2026-11-25T05:00:00Z', pantry()], // digest: Flour fine again
      ['2026-11-25T09:00:00Z', pantry({ FLOUR: 'LATE' })], // < 24 h after 10:00: hold
      ['2026-11-25T10:00:00Z', pantry({ FLOUR: 'LATE' })], // 24 h passed: immediate
    ]);
    assert.deepEqual(
      messages.map((m) => [m.kind, m.at]),
      [
        ['immediate', '2026-11-24T10:00:00Z'],
        ['digest', '2026-11-25T05:00:00Z'],
        ['immediate', '2026-11-25T10:00:00Z'],
      ],
    );
  });

  it('Order today on a critical item is not urgent: it waits for the digest', () => {
    const { messages } = run(startState(), [['2026-11-24T10:00:00Z', pantry({ MILK: 'ORDER_TODAY' })]]);
    assert.equal(messages.length, 0);
  });

  it('two critical items going Late at once give one immediate message', () => {
    const { messages } = run(startState(), [['2026-11-24T10:00:00Z', pantry({ FLOUR: 'LATE', MILK: 'LATE' })]]);
    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0].worse, ['FLOUR', 'MILK']);
  });
});

describe('N6 first run', () => {
  it('sends one digest with every item that is not OK, then only changes', () => {
    const first = run({ states: [], lastDigestDate: null }, [
      ['2026-11-24T10:00:00Z', pantry({ FLOUR: 'LATE', CHEESE: 'LATE', MILK: 'ORDER_TODAY' })],
      ['2026-11-24T10:05:00Z', pantry({ FLOUR: 'LATE', CHEESE: 'LATE', MILK: 'ORDER_TODAY' })],
    ]);
    assert.equal(first.messages.length, 1);
    assert.equal(first.messages[0].kind, 'digest');
    assert.deepEqual(first.messages[0].worse, ['FLOUR', 'MILK', 'CHEESE']);
    assert.equal(first.snapshot.states.length, 5); // Bread is not tracked
  });

  it('waits until quiet hours are over', () => {
    const night = run({ states: [], lastDigestDate: null }, [['2026-11-24T23:00:00Z', pantry({ FLOUR: 'LATE' })]]);
    assert.equal(night.messages.length, 0);
    assert.equal(night.snapshot.states.length, 0);
  });
});

describe('N7 content', () => {
  it('shows item, old → new status, order-by date, quantity and supplier', () => {
    const { messages } = run(startState(), [['2026-11-24T10:00:00Z', pantry({ FLOUR: 'LATE' })]]);
    const [line] = messages[0].body.split('\n').filter((l) => l.includes('Flour'));
    assert.match(line, /Flour/);
    assert.match(line, /OK → Late/);
    assert.match(line, /order now/i);
    assert.match(line, /65 KG/);
    assert.match(line, /North Mill/);
  });
});
