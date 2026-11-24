import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assessRepair } from './repair-status';
import { validateRepairLog } from './repair-log';

const NOW = new Date('2026-11-24T12:00:00Z');
const valid = { issue: 'Cracked joint', repairDate: '2026-11-20', repairedBy: 'Maren' };

describe('validateRepairLog', () => {
  it('accepts a valid past repair and trims text', () => {
    const r = validateRepairLog({ ...valid, issue: '  Cracked joint ', repairedBy: ' Maren ' }, NOW);
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.record, { issue: 'Cracked joint', repairDate: '2026-11-20T12:00:00.000Z', repairedBy: 'Maren' });
  });
  it('today is stored as the moment of logging, not in the future', () => {
    const r = validateRepairLog({ ...valid, repairDate: '2026-11-24' }, NOW);
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.record.repairDate, NOW.toISOString());
  });
  it('rejects a future date', () => {
    const r = validateRepairLog({ ...valid, repairDate: '2026-11-25' }, NOW);
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.errors[0]?.target, 'repairDate');
      assert.equal(r.errors[0]?.code, 400);
      assert.match(r.errors[0]?.message ?? '', /future/);
    }
  });
  it('rejects empty and whitespace fields', () => {
    const r = validateRepairLog({ issue: '  ', repairDate: '', repairedBy: null }, NOW);
    assert.equal(r.ok, false);
    if (!r.ok) assert.deepEqual(r.errors.map((e) => e.target), ['issue', 'repairedBy', 'repairDate']);
  });
  it("rejects 'system' as the person, in any case", () => {
    for (const who of ['system', ' SYSTEM ']) {
      const r = validateRepairLog({ ...valid, repairedBy: who }, NOW);
      assert.equal(r.ok, false);
    }
  });
  it('rejects a malformed date', () => {
    assert.equal(validateRepairLog({ ...valid, repairDate: '2026-13-45' }, NOW).ok, false);
    assert.equal(validateRepairLog({ ...valid, repairDate: 'yesterday' }, NOW).ok, false);
  });
  it('a logged repair makes the existing rule say repaired (until a newer reading)', () => {
    const r = validateRepairLog({ ...valid, repairDate: '2026-11-24' }, NOW);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    const later = new Date('2026-11-24T12:05:00Z');
    assert.equal(assessRepair([r.record.repairDate], ['2026-11-24T11:00:00Z'], later).repaired, true);
    assert.equal(assessRepair([r.record.repairDate], ['2026-11-24T12:01:00Z'], later).repaired, false);
  });
});
