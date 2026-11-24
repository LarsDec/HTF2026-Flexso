import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CONFLICT_FACTOR, describeSourceConflict, flagSourceConflict } from './source-conflict';

describe('flagSourceConflict', () => {
  it('uses a factor of 2', () => assert.equal(CONFLICT_FACTOR, 2));
  it('a sensor above double the nominal flow is a conflict', () => {
    assert.equal(flagSourceConflict(50, [48, 140]), true);
    assert.equal(flagSourceConflict(50, [100.1]), true);
  });
  it('exactly double is not a conflict', () => assert.equal(flagSourceConflict(50, [100]), false));
  it('normal flows are no conflict', () => assert.equal(flagSourceConflict(50, [40, 50, 60]), false));
  it('no sensors is no conflict', () => assert.equal(flagSourceConflict(50, []), false));
  it('missing, zero or negative nominal is no conflict', () => {
    assert.equal(flagSourceConflict(null, [140]), false);
    assert.equal(flagSourceConflict(undefined, [140]), false);
    assert.equal(flagSourceConflict('', [140]), false);
    assert.equal(flagSourceConflict(0, [140]), false);
    assert.equal(flagSourceConflict(-10, [140]), false);
  });
  it('ignores missing or non-numeric sensor flows', () => {
    assert.equal(flagSourceConflict(50, [null, undefined, '', 'abc']), false);
    assert.equal(flagSourceConflict(50, [null, 140]), true);
  });
  it('accepts decimal strings from the database', () => {
    assert.equal(flagSourceConflict('50.00', ['100.00']), false);
    assert.equal(flagSourceConflict('50.00', ['100.01']), true);
  });
});

describe('describeSourceConflict', () => {
  const sensor = (sensorID: string, flowRate: number | string) => ({
    sensorID,
    flowRate,
    modifiedAt: '2026-11-17T03:13:00Z',
    modifiedBy: 'system',
  });
  it('names the disagreeing sensor with when and by whom it was last changed', () => {
    assert.deepEqual(describeSourceConflict('50.00', [sensor('SENS-003', 48), sensor('SENS-004', '140.00')]), {
      sensorID: 'SENS-004',
      sensorFlow: 140,
      nominalFlow: 50,
      changedAt: '2026-11-17T03:13:00.000Z',
      changedBy: 'system',
    });
  });
  it('picks the sensor with the highest flow when several disagree', () => {
    assert.equal(describeSourceConflict(50, [sensor('A', 120), sensor('B', 300)])?.sensorID, 'B');
  });
  it('is null when there is no conflict', () => {
    assert.equal(describeSourceConflict(50, [sensor('A', 100)]), null);
    assert.equal(describeSourceConflict(null, [sensor('A', 140)]), null);
    assert.equal(describeSourceConflict(50, []), null);
  });
  it('keeps the conflict when the audit data is missing', () => {
    const d = describeSourceConflict(50, [{ sensorID: 'A', flowRate: 140, modifiedAt: null, modifiedBy: undefined }]);
    assert.equal(d?.changedAt, null);
    assert.equal(d?.changedBy, null);
  });
});
