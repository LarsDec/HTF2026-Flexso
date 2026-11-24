import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCouncilReport, type MarkedLine } from './council-report';

function line(label: string, changedAt: string | null): MarkedLine {
  return {
    entityName: 'Sensors',
    recordID: label,
    label,
    reason: `reason ${label}`,
    markedBy: 'Ilse',
    markedAt: '2026-11-24T09:00:00Z',
    changedAt,
    changedBy: 'system',
  };
}

const labels = (lines: readonly MarkedLine[]): string[] => lines.map((l) => l.label);

describe('buildCouncilReport', () => {
  it('no marks: empty report', () => {
    const report = buildCouncilReport([]);
    assert.equal(report.total, 0);
    assert.equal(report.pattern, 'none');
    assert.deepEqual(report.buckets, []);
    assert.equal(report.firstChangeAt, null);
  });

  it('lines without a change time give no timeline', () => {
    const report = buildCouncilReport([line('A', null)]);
    assert.equal(report.total, 1);
    assert.equal(report.dated, 0);
    assert.equal(report.pattern, 'none');
  });

  it('one dated line is "single"', () => {
    const report = buildCouncilReport([line('A', '2026-11-17T03:13:00Z')]);
    assert.equal(report.pattern, 'single');
    assert.equal(report.spanMinutes, 0);
  });

  it('three lines in the same minute happened at once, grouped in one hour', () => {
    const report = buildCouncilReport([
      line('B', '2026-11-17T03:13:00Z'),
      line('A', '2026-11-17T03:13:00Z'),
      line('C', '2026-11-17T03:13:00Z'),
    ]);
    assert.equal(report.pattern, 'atOnce');
    assert.equal(report.granularity, 'hour');
    assert.deepEqual(report.buckets, [{ start: '2026-11-17T03:00:00.000Z', count: 3 }]);
    assert.deepEqual(labels(report.lines), ['A', 'B', 'C']);
  });

  it('exactly one hour apart is still at once, one minute more is bit by bit', () => {
    const atOnce = buildCouncilReport([line('A', '2026-11-17T03:00:00Z'), line('B', '2026-11-17T04:00:00Z')]);
    const bitByBit = buildCouncilReport([line('A', '2026-11-17T03:00:00Z'), line('B', '2026-11-17T04:01:00Z')]);
    assert.equal(atOnce.pattern, 'atOnce');
    assert.equal(bitByBit.pattern, 'bitByBit');
  });

  it('spread over days groups by day, earliest first, undated last', () => {
    const report = buildCouncilReport([
      line('late', '2026-11-20T23:59:00Z'),
      line('none', null),
      line('early', '2026-11-10T08:00:00Z'),
      line('same day', '2026-11-10T16:00:00Z'),
    ]);
    assert.equal(report.pattern, 'bitByBit');
    assert.equal(report.granularity, 'day');
    assert.equal(report.dated, 3);
    assert.equal(report.total, 4);
    assert.equal(report.firstChangeAt, '2026-11-10T08:00:00.000Z');
    assert.equal(report.lastChangeAt, '2026-11-20T23:59:00.000Z');
    assert.deepEqual(report.buckets, [
      { start: '2026-11-10T00:00:00.000Z', count: 2 },
      { start: '2026-11-20T00:00:00.000Z', count: 1 },
    ]);
    assert.deepEqual(labels(report.lines), ['early', 'same day', 'late', 'none']);
  });

  it('buckets follow the Oakhaven offset', () => {
    const report = buildCouncilReport([line('A', '2026-11-17T23:30:00Z'), line('B', '2026-11-18T00:10:00Z')], 60);
    assert.deepEqual(report.buckets, [{ start: '2026-11-17T23:00:00.000Z', count: 2 }]);
  });
});
