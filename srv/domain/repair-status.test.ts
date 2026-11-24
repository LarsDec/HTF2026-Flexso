import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assessRepair, flagRepair, lastRepairDetails } from './repair-status';

const NOW = new Date('2026-11-24T12:00:00Z');

describe('assessRepair', () => {
  it('no repairs: no date, not suspicious, not repaired', () => {
    const r = assessRepair([], [], NOW);
    assert.equal(r.lastRepairDate, null);
    assert.equal(r.suspiciousRepair, false);
    assert.equal(r.repaired, false);
  });
  it('picks the newest past repair regardless of order', () => {
    const r = assessRepair(['2026-03-01T00:00:00Z', '2026-09-01T00:00:00Z', '2026-05-01T00:00:00Z'], [], NOW);
    assert.equal(r.lastRepairDate?.toISOString(), '2026-09-01T00:00:00.000Z');
  });
  it('a future repair is suspicious and not counted', () => {
    const r = assessRepair(['2026-12-30T10:00:00Z'], [], NOW);
    assert.equal(r.lastRepairDate, null);
    assert.equal(r.suspiciousRepair, true);
    assert.equal(r.repaired, false);
  });
  it('a repair exactly at now is not in the future', () => {
    const r = assessRepair([NOW], [], NOW);
    assert.equal(r.suspiciousRepair, false);
    assert.equal(r.lastRepairDate?.getTime(), NOW.getTime());
  });
  it('repaired when no sensor reading is newer than the repair', () => {
    assert.equal(assessRepair(['2026-11-21T00:00:00Z'], ['2026-11-20T00:00:00Z'], NOW).repaired, true);
  });
  it('a reading at exactly the repair time does not undo the repair', () => {
    assert.equal(assessRepair(['2026-11-21T00:00:00Z'], ['2026-11-21T00:00:00Z'], NOW).repaired, true);
  });
  it('not repaired when a sensor measured after the repair', () => {
    assert.equal(assessRepair(['2026-11-21T00:00:00Z'], ['2026-11-22T00:00:00Z'], NOW).repaired, false);
  });
  it('repaired with a repair and no sensor readings', () => {
    assert.equal(assessRepair(['2026-11-21T00:00:00Z'], [], NOW).repaired, true);
  });
  it('ignores null, undefined, empty and invalid dates', () => {
    const r = assessRepair([null, undefined, '', 'not a date', '2026-11-01T00:00:00Z'], [null, undefined, 'garbage'], NOW);
    assert.equal(r.lastRepairDate?.toISOString(), '2026-11-01T00:00:00.000Z');
    assert.equal(r.suspiciousRepair, false);
    assert.equal(r.repaired, true);
  });
  it('accepts Date objects and ISO strings', () => {
    const r = assessRepair([new Date('2026-11-01T00:00:00Z')], ['2026-11-02T00:00:00Z'], NOW);
    assert.equal(r.repaired, false);
  });
  it('past and future repairs together: the past one counts and the flag is set', () => {
    const r = assessRepair(['2026-11-01T00:00:00Z', '2027-01-01T00:00:00Z'], [], NOW);
    assert.equal(r.lastRepairDate?.toISOString(), '2026-11-01T00:00:00.000Z');
    assert.equal(r.suspiciousRepair, true);
    assert.equal(r.repaired, true);
  });
});

describe('lastRepairDetails', () => {
  it('no repairs: nothing to show', () => {
    assert.deepEqual(lastRepairDetails([], NOW), { issue: null, repairedBy: null });
  });
  it('takes issue and person from the newest repair, whatever the order', () => {
    const r = lastRepairDetails(
      [
        { repairDate: '2026-05-14T11:30:00Z', issue: 'Old', repairedBy: 'Tobin' },
        { repairDate: '2026-08-20T09:00:00Z', issue: 'Newest', repairedBy: 'Maren' },
        { repairDate: '2026-07-01T09:00:00Z', issue: 'Middle', repairedBy: 'Dana' },
      ],
      NOW,
    );
    assert.deepEqual(r, { issue: 'Newest', repairedBy: 'Maren' });
  });
  it('ignores a repair dated in the future (system entry)', () => {
    const r = lastRepairDetails(
      [
        { repairDate: '2026-12-30T10:00:00Z', issue: 'Future', repairedBy: 'Tobin' },
        { repairDate: '2026-06-30T10:00:00Z', issue: 'Real', repairedBy: 'Maren' },
      ],
      NOW,
    );
    assert.deepEqual(r, { issue: 'Real', repairedBy: 'Maren' });
  });
  it('only a future repair: nothing to show', () => {
    assert.deepEqual(
      lastRepairDetails([{ repairDate: '2026-12-30T10:00:00Z', issue: 'Future', repairedBy: 'x' }], NOW),
      { issue: null, repairedBy: null },
    );
  });
});

describe('flagRepair', () => {
  it('a normal past repair by a person is not flagged', () => {
    const f = flagRepair({ repairDate: '2026-08-20T09:00:00Z', repairedBy: 'Maren Holt' }, NOW);
    assert.deepEqual(f, { futureDated: false, bySystem: false, suspicious: false });
  });
  it('a future date is flagged', () => {
    const f = flagRepair({ repairDate: '2026-12-30T10:00:00Z', repairedBy: 'Tobin Reyes' }, NOW);
    assert.deepEqual(f, { futureDated: true, bySystem: false, suspicious: true });
  });
  it('a line by system is flagged, whatever the case', () => {
    assert.equal(flagRepair({ repairDate: '2026-08-20T09:00:00Z', repairedBy: ' System ' }, NOW).bySystem, true);
  });
  it('a missing date or name never throws', () => {
    assert.equal(flagRepair({ repairDate: null, repairedBy: null }, NOW).futureDated, false);
  });
});
