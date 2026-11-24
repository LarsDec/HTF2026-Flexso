import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluatePipes, newestReading, type PipeInput } from './pipe-overview';

const NOW = new Date('2026-11-24T12:00:00Z');
const minutesAgo = (m: number): Date => new Date(NOW.getTime() - m * 60_000);

function pipe(overrides: Partial<PipeInput> & { ID: string; pipeID: string }): PipeInput {
  return {
    currentFlowRate: 100,
    nominalFlowRate: 100,
    currentPressure: 60,
    sensors: [{ flowRate: 100, lastReading: minutesAgo(1) }],
    repairs: [],
    ...overrides,
  };
}

describe('newestReading', () => {
  it('returns the newest sensor timestamp', () => {
    const newest = newestReading([
      { flowRate: 1, lastReading: minutesAgo(30) },
      { flowRate: 1, lastReading: minutesAgo(2) },
      { flowRate: 1, lastReading: minutesAgo(10).toISOString() },
    ]);
    assert.equal(newest?.getTime(), minutesAgo(2).getTime());
  });
  it('returns null without usable timestamps', () => {
    assert.equal(newestReading([]), null);
    assert.equal(newestReading([{ flowRate: 1, lastReading: null }, { flowRate: 1, lastReading: 'nope' }]), null);
  });
});

describe('evaluatePipes', () => {
  it('returns an empty list for no pipes', () => assert.deepEqual(evaluatePipes([], NOW), []));

  it('keeps the ID and fills every field for a healthy pipe', () => {
    const [e] = evaluatePipes([pipe({ ID: 'u1', pipeID: 'P1' })], NOW);
    assert.equal(e?.ID, 'u1');
    assert.equal(e?.healthStatus, 'fine');
    assert.equal(e?.healthState, 'Success');
    assert.equal(e?.healthIcon, 'sap-icon://sys-enter-2');
    assert.equal(e?.readingAgeMinutes, 1);
    assert.equal(e?.priorityRank, 1);
    assert.equal(e?.priorityReason, 'No action needed.');
    assert.equal(e?.inTodaysPlan, false);
    assert.equal(e?.sourceConflict, false);
    assert.equal(e?.lastRepairDate, null);
    assert.equal(e?.repaired, false);
    assert.equal(e?.suspiciousRepair, false);
  });

  it('ranks the whole set and keeps the SECONDARY-LOOP last', () => {
    const bad = { currentFlowRate: 10 };
    const byId = new Map(
      evaluatePipes(
        [
          pipe({ ID: '1', pipeID: 'SECONDARY-LOOP', ...bad }),
          pipe({ ID: '2', pipeID: 'NORTH-BRANCH-02', ...bad }),
          pipe({ ID: '3', pipeID: 'OK' }),
        ],
        NOW,
      ).map((e) => [e.ID, e]),
    );
    assert.equal(byId.get('2')?.priorityRank, 1);
    assert.equal(byId.get('2')?.inTodaysPlan, true);
    assert.equal(byId.get('2')?.healthState, 'Error');
    assert.equal(byId.get('3')?.priorityRank, 2);
    assert.equal(byId.get('1')?.priorityRank, 3);
  });

  it('a pipe without sensors is unknown with no reading age', () => {
    const [e] = evaluatePipes([pipe({ ID: '1', pipeID: 'P', sensors: [] })], NOW);
    assert.equal(e?.healthStatus, 'unknown');
    assert.equal(e?.healthState, 'None');
    assert.equal(e?.readingAgeMinutes, null);
  });

  it('a stale newest reading makes the pipe unknown', () => {
    const [e] = evaluatePipes([pipe({ ID: '1', pipeID: 'P', sensors: [{ flowRate: 100, lastReading: minutesAgo(20) }] })], NOW);
    assert.equal(e?.healthStatus, 'unknown');
    assert.equal(e?.readingAgeMinutes, 20);
  });

  it('freshness uses the newest sensor, not the oldest', () => {
    const [e] = evaluatePipes(
      [
        pipe({
          ID: '1',
          pipeID: 'P',
          sensors: [
            { flowRate: 100, lastReading: minutesAgo(60) },
            { flowRate: 100, lastReading: minutesAgo(3) },
          ],
        }),
      ],
      NOW,
    );
    assert.equal(e?.healthStatus, 'fine');
    assert.equal(e?.readingAgeMinutes, 3);
  });

  it('flags a source conflict from sensor flow versus nominal flow', () => {
    const [e] = evaluatePipes([pipe({ ID: '1', pipeID: 'P', sensors: [{ flowRate: 250, lastReading: minutesAgo(1) }] })], NOW);
    assert.equal(e?.sourceConflict, true);
  });

  it('reports the repair date as ISO string and the repaired flag', () => {
    const [e] = evaluatePipes(
      [pipe({ ID: '1', pipeID: 'P', repairs: [{ repairDate: minutesAgo(10) }], sensors: [{ flowRate: 100, lastReading: minutesAgo(20) }] })],
      NOW,
    );
    assert.equal(e?.lastRepairDate, minutesAgo(10).toISOString());
    assert.equal(e?.repaired, true);
  });

  it('a future repair is suspicious and not repaired', () => {
    const future = new Date(NOW.getTime() + 86_400_000);
    const [e] = evaluatePipes([pipe({ ID: '1', pipeID: 'P', repairs: [{ repairDate: future }] })], NOW);
    assert.equal(e?.suspiciousRepair, true);
    assert.equal(e?.lastRepairDate, null);
    assert.equal(e?.repaired, false);
  });

  it('accepts decimal strings for flow and pressure', () => {
    const [e] = evaluatePipes(
      [pipe({ ID: '1', pipeID: 'P', currentFlowRate: '80.00', nominalFlowRate: '100.00', currentPressure: '40.00' })],
      NOW,
    );
    assert.equal(e?.healthStatus, 'fine');
  });
});
