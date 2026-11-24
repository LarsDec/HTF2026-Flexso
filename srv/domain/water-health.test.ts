import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluatePipes, type PipeInput } from './pipe-overview';
import { rankPipes, STATUS_ORDER, type AssessedPipe } from './priority';
import { assessRepair } from './repair-status';
import { flagSourceConflict } from './source-conflict';
import { assessPipe, type PipeReading } from './water-health';

const NOW = new Date('2026-11-24T12:00:00Z');
const fresh = new Date(NOW.getTime() - 60_000);

function reading(overrides: Partial<PipeReading> = {}): PipeReading {
  return { currentFlowRate: 100, nominalFlowRate: 100, currentPressure: 60, lastReadingAt: fresh, ...overrides };
}

describe('assessPipe thresholds', () => {
  it('ratio 0.8 and 40 PSI are fine', () => {
    assert.equal(assessPipe(reading({ currentFlowRate: 80, currentPressure: 40 }), NOW).status, 'fine');
  });
  it('ratio just under 0.8 or 40 PSI just under is attention', () => {
    assert.equal(assessPipe(reading({ currentFlowRate: 79.9 }), NOW).status, 'attention');
    assert.equal(assessPipe(reading({ currentPressure: 39.9 }), NOW).status, 'attention');
  });
  it('ratio 0.5 and 25 PSI are attention, not alarm', () => {
    assert.equal(assessPipe(reading({ currentFlowRate: 50 }), NOW).status, 'attention');
    assert.equal(assessPipe(reading({ currentPressure: 25 }), NOW).status, 'attention');
  });
  it('just under 0.5 or 25 PSI is alarm', () => {
    assert.equal(assessPipe(reading({ currentFlowRate: 49.9 }), NOW).status, 'alarm');
    assert.equal(assessPipe(reading({ currentPressure: 24.9 }), NOW).status, 'alarm');
  });
  it('the worst of flow and pressure wins', () => {
    assert.equal(assessPipe(reading({ currentFlowRate: 70, currentPressure: 20 }), NOW).status, 'alarm');
    assert.equal(assessPipe(reading({ currentFlowRate: 40, currentPressure: 35 }), NOW).status, 'alarm');
  });
  it('reason contains the numbers', () => {
    const { reason } = assessPipe(reading({ currentFlowRate: 20, nominalFlowRate: 65, currentPressure: 22 }), NOW);
    assert.match(reason, /20 of 65 L\/min/);
    assert.match(reason, /22 PSI/);
  });
});

describe('assessPipe unknown', () => {
  it('reading of exactly 15:00 is still valid, 15:01 is unknown', () => {
    const at = (ms: number): Date => new Date(NOW.getTime() - ms);
    assert.equal(assessPipe(reading({ lastReadingAt: at(15 * 60_000) }), NOW).status, 'fine');
    assert.equal(assessPipe(reading({ lastReadingAt: at(15 * 60_000 + 60_000) }), NOW).status, 'unknown');
  });
  it('missing timestamp, flow, pressure, nominal or nominal 0 is unknown', () => {
    assert.equal(assessPipe(reading({ lastReadingAt: null }), NOW).status, 'unknown');
    assert.equal(assessPipe(reading({ currentFlowRate: null }), NOW).status, 'unknown');
    assert.equal(assessPipe(reading({ currentPressure: undefined }), NOW).status, 'unknown');
    assert.equal(assessPipe(reading({ nominalFlowRate: null }), NOW).status, 'unknown');
    assert.equal(assessPipe(reading({ nominalFlowRate: 0 }), NOW).status, 'unknown');
  });
  it('unknown beats alarm', () => {
    assert.equal(assessPipe(reading({ currentFlowRate: 1, lastReadingAt: null }), NOW).status, 'unknown');
  });
  it('accepts decimal strings from the database', () => {
    assert.equal(assessPipe(reading({ currentFlowRate: '80.00', nominalFlowRate: '100.00', currentPressure: '40.00' }), NOW).status, 'fine');
  });
});

describe('rankPipes', () => {
  const pipe = (pipeID: string, status: AssessedPipe['status']): AssessedPipe => ({ pipeID, status });
  const order = (pipes: AssessedPipe[]): string[] => rankPipes(pipes).map((r) => r.pipeID);

  it('SECONDARY-LOOP is always last, even in alarm', () => {
    assert.deepEqual(order([pipe('SECONDARY-LOOP', 'alarm'), pipe('A', 'fine'), pipe('B', 'attention')]), ['B', 'A', 'SECONDARY-LOOP']);
  });
  it('NORTH-BRANCH-02 comes first among equal statuses', () => {
    assert.deepEqual(
      order([pipe('BAKERY-BRANCH', 'alarm'), pipe('SOUTH-BRANCH', 'alarm'), pipe('NORTH-BRANCH-02', 'alarm')])[0],
      'NORTH-BRANCH-02',
    );
  });
  it('follows STATUS_ORDER', () => {
    const sorted = order([pipe('A', 'fine'), pipe('B', 'attention'), pipe('C', 'unknown'), pipe('D', 'alarm')]);
    assert.deepEqual(sorted, [...STATUS_ORDER].map((s) => ({ alarm: 'D', unknown: 'C', attention: 'B', fine: 'A' })[s]));
  });
  it('ties on dependants fall back to pipeID', () => {
    assert.deepEqual(order([pipe('B', 'alarm'), pipe('A', 'alarm')]), ['A', 'B']);
  });
  it('plan holds max 2 and only problem pipes', () => {
    const ranked = rankPipes([pipe('A', 'alarm'), pipe('B', 'alarm'), pipe('C', 'attention'), pipe('D', 'fine')]);
    assert.deepEqual(ranked.filter((r) => r.inTodaysPlan).map((r) => r.pipeID), ['A', 'B']);
    const calm = rankPipes([pipe('SECONDARY-LOOP', 'fine'), pipe('D', 'fine')]);
    assert.ok(calm.every((r) => !r.inTodaysPlan));
  });
  it('priorityReason uses the words of the villagers and invents no numbers', () => {
    const byId = new Map(rankPipes([pipe('NORTH-BRANCH-02', 'alarm'), pipe('BAKERY-BRANCH', 'alarm'), pipe('X', 'alarm')]).map((r) => [r.pipeID, r.priorityReason]));
    assert.match(byId.get('NORTH-BRANCH-02') ?? '', /about 140 families in North Residential Area/);
    assert.match(byId.get('BAKERY-BRANCH') ?? '', /bread for the whole village/);
    assert.match(byId.get('X') ?? '', /unknown/);
  });
});

describe('flagSourceConflict', () => {
  it('sensor 140 vs nominal 50 is a conflict', () => assert.equal(flagSourceConflict(50, [48, 140]), true));
  it('exactly double is not a conflict', () => assert.equal(flagSourceConflict(50, [100]), false));
  it('missing nominal is no conflict', () => assert.equal(flagSourceConflict(null, [140]), false));
});

describe('assessRepair', () => {
  const sensors = [new Date('2026-11-20T00:00:00Z')];
  it('ignores a future repair and flags it', () => {
    const r = assessRepair(['2026-06-30T10:00:00Z', '2026-12-30T10:00:00Z'], sensors, NOW);
    assert.equal(r.lastRepairDate?.toISOString(), '2026-06-30T10:00:00.000Z');
    assert.equal(r.suspiciousRepair, true);
    assert.equal(r.repaired, false);
  });
  it('repaired when no sensor reading is newer than the repair', () => {
    assert.equal(assessRepair(['2026-11-21T00:00:00Z'], sensors, NOW).repaired, true);
  });
  it('no repair means not repaired', () => {
    assert.equal(assessRepair([], [], NOW).repaired, false);
  });
});

describe('evaluatePipes', () => {
  it('fills every field and ranks the whole set', () => {
    const base = { currentPressure: 60, nominalFlowRate: 100, repairs: [] };
    const pipes: PipeInput[] = [
      { ID: '1', pipeID: 'SECONDARY-LOOP', currentFlowRate: 10, ...base, sensors: [{ flowRate: 10, lastReading: fresh }] },
      { ID: '2', pipeID: 'NORTH-BRANCH-02', currentFlowRate: 10, ...base, sensors: [{ flowRate: 10, lastReading: fresh }] },
      { ID: '3', pipeID: 'OK', currentFlowRate: 100, ...base, sensors: [] },
    ];
    const byId = new Map(evaluatePipes(pipes, NOW).map((e) => [e.ID, e]));
    assert.equal(byId.get('2')?.priorityRank, 1);
    assert.equal(byId.get('2')?.healthState, 'Error');
    assert.equal(byId.get('1')?.priorityRank, 3);
    assert.equal(byId.get('3')?.healthStatus, 'unknown');
    assert.equal(byId.get('3')?.healthState, 'None');
    assert.equal(byId.get('3')?.readingAgeMinutes, null);
    assert.equal(byId.get('2')?.readingAgeMinutes, 1);
  });
});
