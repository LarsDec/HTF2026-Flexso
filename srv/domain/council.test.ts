import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildCouncilPage,
  COUNCIL_LEVEL_ORDER,
  type CouncilInput,
  type CouncilItem,
  type CouncilLandmark,
  type CouncilPage,
  type CouncilPipe,
  type TrustMark,
} from './council';
import { evaluatePipes, type PipeInput } from './pipe-overview';
import { KNOWN_DEPENDANTS } from './priority';

const NOW = new Date('2026-11-16T17:05:00Z');
const FRESH = '2026-11-16T17:00:00Z';
const STALE = '2026-11-16T16:00:00Z';
const uuid = (prefix: string, n: number): string => `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Seed pipes (db/data CSVs): pipeID, nominal, current flow, pressure. */
const PIPE_SEED: readonly (readonly [string, number, number, number])[] = [
  ['PRIMARY-MAIN', 150, 142, 58],
  ['NORTH-BRANCH-01', 80, 76, 52],
  ['NORTH-BRANCH-02', 65, 20, 22],
  ['BAKERY-BRANCH', 50, 47, 47],
  ['SOUTH-BRANCH', 60, 40, 38],
  ['SECONDARY-LOOP', 40, 12, 20],
];
const SENSOR_FLOW: readonly number[] = [142, 76, 20, 140, 40, 12];

function pipes(staleSensors: readonly string[] = []): CouncilPipe[] {
  const inputs: PipeInput[] = PIPE_SEED.map(([pipeID, nominal, flow, pressure], i) => ({
    ID: uuid('1', i + 1),
    pipeID,
    currentFlowRate: String(flow),
    nominalFlowRate: String(nominal),
    currentPressure: String(pressure),
    sensors: [{ flowRate: SENSOR_FLOW[i] ?? 0, lastReading: staleSensors.includes(pipeID) ? STALE : FRESH }],
    repairs: [],
  }));
  const evaluations = new Map(evaluatePipes(inputs, NOW).map((e) => [e.ID, e]));
  return inputs.map((p, i) => ({
    ID: p.ID,
    pipeID: p.pipeID,
    status: evaluations.get(p.ID)?.healthStatus ?? 'unknown',
    priorityRank: evaluations.get(p.ID)?.priorityRank ?? 0,
    currentFlowRate: p.currentFlowRate,
    nominalFlowRate: p.nominalFlowRate,
    currentPressure: p.currentPressure,
    readingAgeMinutes: evaluations.get(p.ID)?.readingAgeMinutes ?? null,
    sensors: [{ ID: uuid('2', i + 1), sensorID: `SENS-00${i + 1}`, flowRate: SENSOR_FLOW[i] ?? 0 }],
    repairs: i === 2 ? [{ ID: uuid('3', 1), issue: 'Leak near the mill' }] : [],
  }));
}

/** Seed items: name, unit, stock, minimum, critical, supplier. */
const ITEM_SEED: readonly (readonly [string, string, string, string, boolean, string | null])[] = [
  ['Grain', 'KG', '45', '30', false, 'North Mill'],
  ['Milk', 'L', '180', '120', true, 'Local Dairy Farm'],
  ['Apples', 'KG', '35', '25', false, 'Travelling merchant'],
  ['Flour', 'KG', '40', '45', true, 'North Mill'],
  ['Butter', 'KG', '-3', '12', true, 'South Meadow Farms'],
  ['Eggs', 'Dozen', '5', '12', false, 'South Meadow Farms'],
  ['Potatoes', 'KG', '80', '50', false, 'Travelling merchant'],
  ['Bread', 'Number', '35', '20', false, null],
  ['Cheese', 'KG', '12', '8', false, 'Travelling merchant'],
  ['Salt', 'KG', '15', '10', false, 'Travelling merchant'],
];
function items(patch: Readonly<Record<string, Partial<CouncilItem>>> = {}): CouncilItem[] {
  return ITEM_SEED.map(([name, unit, currentQuantity, minStockLevel, isCritical, supplierName], i) => ({
    ID: uuid('5', i + 1),
    name,
    unit,
    currentQuantity,
    minStockLevel,
    isCritical,
    supplierName,
    dataError: Number(currentQuantity) < 0,
    ...patch[name],
  }));
}

const LANDMARKS: readonly CouncilLandmark[] = [
  { ID: uuid('4', 1), name: 'Silverbrook Spring', suppliedBy: null },
  { ID: uuid('4', 2), name: 'North Mill House', suppliedBy: null },
  { ID: uuid('4', 5), name: 'North Residential Area', suppliedBy: 'NORTH-BRANCH-02' },
  { ID: uuid('4', 6), name: 'The Bakery', suppliedBy: 'BAKERY-BRANCH' },
  { ID: uuid('4', 7), name: 'South Meadow Farms', suppliedBy: 'SOUTH-BRANCH' },
];

const idOf = (collection: readonly { ID: string }[], index: number): string => collection[index]?.ID ?? '';
const itemId = (name: string): string => items().find((i) => i.name === name)?.ID ?? '';
const pipeId = (name: string): string => pipes().find((p) => p.pipeID === name)?.ID ?? '';
const mark = (entityName: TrustMark['entityName'], recordID: string, reason = 'Looks wrong'): TrustMark => ({
  entityName,
  recordID,
  reason,
  markedBy: 'ilse',
  markedAt: '2026-11-16T10:00:00Z',
});

function page(over: Partial<CouncilInput> = {}): CouncilPage {
  return buildCouncilPage({ pipes: pipes(), items: items(), landmarks: LANDMARKS, marks: [], ...over });
}
const subjects = (p: CouncilPage): string[] => p.problems.map((x) => x.subject);
const row = (p: CouncilPage, subject: string): CouncilPage['problems'][number] => {
  const found = p.problems.find((x) => x.subject === subject);
  assert.ok(found, `no problem row for ${subject}`);
  return found;
};

/** Invariants that must hold for every page (scenario 11). */
function checkInvariants(p: CouncilPage, label: string): void {
  const problemIds = new Set(p.problems.map((x) => x.ID.replace(/^(water|food):/, '')));
  for (const u of p.untrusted) {
    const recordID = u.ID.split(':')[1] ?? '';
    if (u.lineKind === 'pipe' || u.lineKind === 'stockItem') {
      assert.ok(!problemIds.has(recordID), `${label}: untrusted ${u.ID} is in problems`);
    }
  }
  for (const x of p.problems) {
    if (x.peopleCount !== null) {
      assert.equal(x.area, 'water', `${label}: food row has a count`);
      assert.ok(typeof KNOWN_DEPENDANTS[x.subject] === 'number', `${label}: count on unknown pipe ${x.subject}`);
    }
    if (x.area === 'food') assert.equal(x.peopleCount, null);
  }
  const body = p.problems.filter((x) => !x.lastOnList);
  for (let i = 1; i < body.length; i += 1) {
    assert.ok(
      COUNCIL_LEVEL_ORDER.indexOf(body[i - 1]!.level) <= COUNCIL_LEVEL_ORDER.indexOf(body[i]!.level),
      `${label}: level order broken at ${body[i]?.subject}`,
    );
  }
  assert.deepEqual(p.problems.map((x) => x.rank), p.problems.map((_, i) => i + 1));
  for (const x of p.problems) assert.equal(x.lastOnList, x.subject === 'SECONDARY-LOOP');
  if (p.problems.some((x) => x.lastOnList)) assert.equal(p.problems.at(-1)?.lastOnList, true);
}

describe('buildCouncilPage seed data', () => {
  const p = page();
  it('ranks the five problems in the expected order', () => {
    assert.deepEqual(subjects(p), ['NORTH-BRANCH-02', 'Eggs', 'Flour', 'SOUTH-BRANCH', 'SECONDARY-LOOP']);
    assert.deepEqual(p.problems.map((x) => x.level), ['waterAlarm', 'foodPanic', 'foodNervous', 'waterAttention', 'waterAlarm']);
  });
  it('North Branch 02: 20 of 65 L/min, 140 families, North Residential Area', () => {
    const r = row(p, 'NORTH-BRANCH-02');
    assert.equal(r.flowRate, 20);
    assert.equal(r.nominalFlowRate, 65);
    assert.equal(r.flowPercent, 31);
    assert.equal(r.pressure, 22);
    assert.equal(r.peopleKind, 'families');
    assert.equal(r.peopleCount, 140);
    assert.equal(r.places, 'North Residential Area');
    assert.equal(r.tiedTo, null);
    assert.equal(r.levelState, 'Error');
    assert.equal(r.levelIcon, 'sap-icon://alert');
  });
  it('Eggs: food panic, tied to SOUTH-BRANCH via South Meadow Farms', () => {
    const r = row(p, 'Eggs');
    assert.equal(r.quantity, 5);
    assert.equal(r.minimum, 12);
    assert.equal(r.unit, 'Dozen');
    assert.equal(r.peopleKind, 'wholeVillage');
    assert.equal(r.peopleCount, null);
    assert.equal(r.tiedTo, 'SOUTH-BRANCH');
    assert.equal(r.tieVia, 'South Meadow Farms');
    assert.equal(r.levelIcon, 'sap-icon://alert');
  });
  it('Flour: nervous, no tie (North Mill is not North Mill House)', () => {
    const r = row(p, 'Flour');
    assert.equal(r.level, 'foodNervous');
    assert.equal(r.quantity, 40);
    assert.equal(r.tiedTo, null);
    assert.equal(r.tiedToUntrusted, null);
    assert.equal(r.tieVia, null);
    assert.equal(r.levelState, 'Warning');
  });
  it('SOUTH-BRANCH: attention, unknown people, note, tied to Eggs and untrusted Butter', () => {
    const r = row(p, 'SOUTH-BRANCH');
    assert.equal(r.flowPercent, 67);
    assert.equal(r.peopleKind, 'unknown');
    assert.equal(r.peopleCount, null);
    assert.equal(r.places, 'South Meadow Farms');
    assert.equal(r.pipeNote, 'farmAnimalsHalfDay');
    assert.equal(r.tiedTo, 'Eggs');
    assert.equal(r.tiedToUntrusted, 'Butter');
  });
  it('SECONDARY-LOOP: alarm but last, nobody depends on it', () => {
    const r = row(p, 'SECONDARY-LOOP');
    assert.equal(r.level, 'waterAlarm');
    assert.equal(r.peopleKind, 'nobody');
    assert.equal(r.peopleCount, null);
    assert.equal(r.lastOnList, true);
    assert.equal(r.flowPercent, 30);
    assert.equal(r.tiedTo, null);
  });
  it('lists Butter and SENS-004 as found by the app', () => {
    assert.equal(p.untrusted.length, 2);
    const butter = p.untrusted[0]!;
    assert.deepEqual(
      [butter.lineKind, butter.subject, butter.source, butter.recordedValue, butter.recordedUnit, butter.effect],
      ['stockItem', 'Butter', 'impossibleStock', -3, 'KG', 'notRanked'],
    );
    assert.equal(butter.reason, null);
    const sensor = p.untrusted[1]!;
    assert.deepEqual(
      [sensor.lineKind, sensor.subject, sensor.parentSubject, sensor.source, sensor.recordedValue, sensor.comparedTo, sensor.effect],
      ['sensor', 'SENS-004', 'BAKERY-BRANCH', 'sourceConflict', 140, 50, 'pipeRankedOnOwnReading'],
    );
  });
  it('summary matches the design', () => {
    assert.deepEqual(p.summary, {
      pipesTotal: 6,
      pipesAlarm: 2,
      pipesUnknown: 0,
      pipesAttention: 1,
      pipesFine: 3,
      pipesNotCounted: 0,
      waterFineNames: 'BAKERY-BRANCH, NORTH-BRANCH-01, PRIMARY-MAIN',
      itemsTotal: 10,
      itemsPanic: 1,
      itemsNervous: 1,
      itemsFine: 7,
      itemsNotCounted: 1,
      foodFineNames: 'Apples, Bread, Cheese, Grain, Milk, Potatoes, Salt',
      untrustedCount: 2,
    });
  });
  it('invariants', () => checkInvariants(p, 'seed'));
});

describe('buildCouncilPage scenarios', () => {
  it('1. Ilse marks Butter and SENS-004: same problems, two mark lines, no duplicates', () => {
    const p = page({ marks: [mark('StockItems', itemId('Butter'), 'Cannot be negative'), mark('Sensors', idOf(pipes()[3]!.sensors, 0))] });
    assert.deepEqual(subjects(p), ['NORTH-BRANCH-02', 'Eggs', 'Flour', 'SOUTH-BRANCH', 'SECONDARY-LOOP']);
    assert.equal(p.untrusted.length, 2);
    assert.ok(p.untrusted.every((u) => u.source === 'mark' && u.markedBy === 'ilse' && u.markedAt !== null));
    assert.equal(p.untrusted[0]?.reason, 'Cannot be negative');
    checkInvariants(p, 's1');
  });
  it('2. Ilse marks Eggs: not ranked, SOUTH-BRANCH ties only to untrusted lines', () => {
    const p = page({ marks: [mark('StockItems', itemId('Eggs'))] });
    assert.deepEqual(subjects(p), ['NORTH-BRANCH-02', 'Flour', 'SOUTH-BRANCH', 'SECONDARY-LOOP']);
    const eggs = p.untrusted.find((u) => u.subject === 'Eggs');
    assert.equal(eggs?.effect, 'notRanked');
    assert.equal(row(p, 'SOUTH-BRANCH').tiedTo, null);
    assert.equal(row(p, 'SOUTH-BRANCH').tiedToUntrusted, 'Butter, Eggs');
    assert.equal(p.summary.itemsPanic, 0);
    assert.equal(p.summary.itemsNotCounted, 2);
    checkInvariants(p, 's2');
  });
  it('3. NORTH-BRANCH-02 reading too old: unknown at rank 3, still 140 families', () => {
    const p = page({ pipes: pipes(['NORTH-BRANCH-02']) });
    assert.deepEqual(subjects(p), ['Eggs', 'Flour', 'NORTH-BRANCH-02', 'SOUTH-BRANCH', 'SECONDARY-LOOP']);
    const r = row(p, 'NORTH-BRANCH-02');
    assert.equal(r.level, 'waterUnknown');
    assert.equal(r.rank, 3);
    assert.equal(r.peopleCount, 140);
    checkInvariants(p, 's3');
  });
  it('4. SECONDARY-LOOP unknown or attention is still last', () => {
    const stale = page({ pipes: pipes(['SECONDARY-LOOP']) });
    assert.equal(row(stale, 'SECONDARY-LOOP').level, 'waterUnknown');
    assert.equal(stale.problems.at(-1)?.subject, 'SECONDARY-LOOP');
    const attention = pipes().map((x) => (x.pipeID === 'SECONDARY-LOOP' ? { ...x, status: 'attention' as const } : x));
    const p = page({ pipes: attention });
    assert.equal(row(p, 'SECONDARY-LOOP').level, 'waterAttention');
    assert.equal(p.problems.at(-1)?.subject, 'SECONDARY-LOOP');
    checkInvariants(p, 's4');
  });
  it('5. Ilse marks the SOUTH-BRANCH pipe: not ranked, Eggs ties to it as untrusted', () => {
    const p = page({ marks: [mark('WaterPipes', pipeId('SOUTH-BRANCH'))] });
    assert.deepEqual(subjects(p), ['NORTH-BRANCH-02', 'Eggs', 'Flour', 'SECONDARY-LOOP']);
    assert.equal(row(p, 'Eggs').tiedTo, null);
    assert.equal(row(p, 'Eggs').tiedToUntrusted, 'SOUTH-BRANCH');
    assert.equal(p.untrusted.find((u) => u.subject === 'SOUTH-BRANCH')?.effect, 'notRanked');
    assert.equal(p.summary.pipesNotCounted, 1);
    assert.equal(p.summary.pipesAttention, 0);
    checkInvariants(p, 's5');
  });
  it('6. Ilse marks the South Meadow Farms landmark: no places, no ties', () => {
    const p = page({ marks: [mark('Landmarks', idOf(LANDMARKS, 4))] });
    assert.equal(row(p, 'SOUTH-BRANCH').places, null);
    assert.equal(row(p, 'SOUTH-BRANCH').tiedTo, null);
    assert.equal(row(p, 'SOUTH-BRANCH').tiedToUntrusted, null);
    assert.equal(row(p, 'Eggs').tiedTo, null);
    assert.equal(p.untrusted.find((u) => u.lineKind === 'landmark')?.effect, 'notUsedForPlacesAndTies');
    checkInvariants(p, 's6');
  });
  it('7. SOUTH-BRANCH fine: Eggs has no tie', () => {
    const fine = pipes().map((x) => (x.pipeID === 'SOUTH-BRANCH' ? { ...x, status: 'fine' as const } : x));
    const p = page({ pipes: fine });
    assert.equal(row(p, 'Eggs').tiedTo, null);
    assert.ok(!subjects(p).includes('SOUTH-BRANCH'));
    checkInvariants(p, 's7');
  });
  it('8. Milk nervous (critical) and Eggs nervous: Milk before Eggs', () => {
    const p = page({ items: items({ Milk: { currentQuantity: '100' }, Eggs: { currentQuantity: '10' } }) });
    const order = subjects(p).filter((s) => s === 'Milk' || s === 'Eggs');
    assert.deepEqual(order, ['Milk', 'Eggs']);
    assert.equal(row(p, 'Milk').level, 'foodNervous');
    checkInvariants(p, 's8');
  });
  it('9. Everything fine and no marks: no problems', () => {
    const allFine = pipes().map((x) => ({ ...x, status: 'fine' as const }));
    const p = page({ pipes: allFine, items: items({ Butter: { currentQuantity: '20', dataError: false }, Eggs: { currentQuantity: '12' }, Flour: { currentQuantity: '45' } }) });
    assert.deepEqual(p.problems, []);
    assert.equal(p.summary.itemsFine, 10);
    checkInvariants(p, 's9');
  });
  it('10. Mark on an unknown record is listed as record not found', () => {
    const p = page({ marks: [mark('Repairs', 'does-not-exist', 'Gone')] });
    const u = p.untrusted.find((x) => x.ID === 'Repairs:does-not-exist');
    assert.deepEqual([u?.effect, u?.lineKind, u?.subject, u?.reason], ['recordNotFound', 'repair', 'does-not-exist', 'Gone']);
    checkInvariants(p, 's10');
  });
  it('a marked sensor puts a trust note on its pipe, which stays ranked', () => {
    const p = page({ marks: [mark('Sensors', idOf(pipes()[2]!.sensors, 0))] });
    const r = row(p, 'NORTH-BRANCH-02');
    assert.equal(r.trustNote, 'sensorNotTrusted');
    assert.equal(r.trustNoteSubject, 'SENS-003');
    assert.equal(r.rank, 1);
  });
  it('a marked repair is listed and not used on the page', () => {
    const p = page({ marks: [mark('Repairs', uuid('3', 1))] });
    const u = p.untrusted.find((x) => x.lineKind === 'repair');
    assert.deepEqual([u?.subject, u?.parentSubject, u?.effect], ['Leak near the mill', 'NORTH-BRANCH-02', 'notUsedOnPage']);
  });
  it('a mark replaces the automatic finding on the same record', () => {
    const p = page({ marks: [mark('StockItems', itemId('Butter'))] });
    assert.equal(p.untrusted.filter((u) => u.subject === 'Butter').length, 1);
  });
  it('a pipe with no problem and no marks has no row even when it feeds a landmark', () => {
    assert.ok(!subjects(page()).includes('BAKERY-BRANCH'));
  });
  it('handles empty input', () => {
    const p = buildCouncilPage({ pipes: [], items: [], landmarks: [], marks: [] });
    assert.deepEqual(p.problems, []);
    assert.deepEqual(p.untrusted, []);
    assert.equal(p.summary.pipesTotal, 0);
  });
});
