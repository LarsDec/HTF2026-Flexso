import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  findSuspiciousLines,
  isImpossibleSensorFlow,
  isInQuietHours,
  isNegativeStock,
  isNonPersonEditor,
  type InvestigationInput,
} from './investigation';

describe('isImpossibleSensorFlow', () => {
  it('exactly double the nominal flow is not flagged', () => assert.equal(isImpossibleSensorFlow(100, 50), false));
  it('just above double is flagged', () => assert.equal(isImpossibleSensorFlow(100.01, 50), true));
  it('accepts decimal strings from the database', () => {
    assert.equal(isImpossibleSensorFlow('100.00', '50.00'), false);
    assert.equal(isImpossibleSensorFlow('100.01', '50.00'), true);
  });
  it('null, empty or non-numeric flow gives false', () => {
    assert.equal(isImpossibleSensorFlow(null, 50), false);
    assert.equal(isImpossibleSensorFlow('', 50), false);
    assert.equal(isImpossibleSensorFlow('abc', 50), false);
  });
  it('missing, zero or negative nominal gives false', () => {
    assert.equal(isImpossibleSensorFlow(140, null), false);
    assert.equal(isImpossibleSensorFlow(140, undefined), false);
    assert.equal(isImpossibleSensorFlow(140, 0), false);
    assert.equal(isImpossibleSensorFlow(140, -5), false);
  });
  it('uses a custom factor', () => assert.equal(isImpossibleSensorFlow(160, 50, 3), true));
});

describe('isNegativeStock', () => {
  it('zero is fine', () => assert.equal(isNegativeStock(0), false));
  it('-0.01 is not', () => assert.equal(isNegativeStock(-0.01), true));
  it('positive and unknown are fine', () => {
    assert.equal(isNegativeStock(12), false);
    assert.equal(isNegativeStock(null), false);
    assert.equal(isNegativeStock(undefined), false);
  });
  it('accepts decimal strings', () => assert.equal(isNegativeStock('-3.00'), true));
});

describe('isNonPersonEditor', () => {
  it('empty, system and anonymous are non-persons', () => {
    assert.equal(isNonPersonEditor(''), true);
    assert.equal(isNonPersonEditor('   '), true);
    assert.equal(isNonPersonEditor('system'), true);
    assert.equal(isNonPersonEditor('anonymous'), true);
  });
  it('is not case sensitive and trims', () => {
    assert.equal(isNonPersonEditor('  SYSTEM '), true);
    assert.equal(isNonPersonEditor('Anonymous'), true);
  });
  it('null and undefined count as non-person', () => {
    assert.equal(isNonPersonEditor(null), true);
    assert.equal(isNonPersonEditor(undefined), true);
  });
  it('a named person is fine', () => {
    assert.equal(isNonPersonEditor('maren.holt'), false);
    assert.equal(isNonPersonEditor('council'), false);
  });
});

describe('isInQuietHours', () => {
  it('00:00:00 is inside', () => assert.equal(isInQuietHours('2026-11-17T00:00:00Z'), true));
  it('03:59:59 is inside', () => assert.equal(isInQuietHours('2026-11-17T03:59:59Z'), true));
  it('04:00:00 is outside', () => assert.equal(isInQuietHours('2026-11-17T04:00:00Z'), false));
  it('23:59:59 is outside', () => assert.equal(isInQuietHours('2026-11-16T23:59:59Z'), false));
  it('accepts a Date', () => assert.equal(isInQuietHours(new Date('2026-11-17T03:13:00Z')), true));
  it('invalid or missing date gives false', () => {
    assert.equal(isInQuietHours('not a date'), false);
    assert.equal(isInQuietHours(null), false);
    assert.equal(isInQuietHours(undefined), false);
  });
  it('honours a UTC offset', () => {
    assert.equal(isInQuietHours('2026-11-17T03:13:00Z', 120), false);
    assert.equal(isInQuietHours('2026-11-16T22:30:00Z', 120), true);
  });
});

/** Minimal CSV reader for the seed files (handles quoted fields with commas). */
function readCsv(file: string): Record<string, string>[] {
  const text = readFileSync(join(__dirname, '..', '..', 'db', 'data', file), 'utf8').replace(/\r/g, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows;
  return body
    .filter((cells) => cells.length === header.length)
    .map((cells) => Object.fromEntries(header.map((name, index) => [name, cells[index]])));
}

describe('findSuspiciousLines on the seed data', () => {
  const input: InvestigationInput = {
    pipes: readCsv('oakhaven.curse-WaterPipes.csv') as unknown as InvestigationInput['pipes'],
    sensors: readCsv('oakhaven.curse-Sensors.csv') as unknown as InvestigationInput['sensors'],
    repairs: readCsv('oakhaven.curse-Repairs.csv') as unknown as InvestigationInput['repairs'],
    landmarks: readCsv('oakhaven.curse-Landmarks.csv') as unknown as InvestigationInput['landmarks'],
    stockItems: readCsv('oakhaven.curse-StockItems.csv') as unknown as InvestigationInput['stockItems'],
  };
  const findings = findSuspiciousLines(input);

  it('finds exactly three lines', () => assert.equal(findings.length, 3));

  it('sensor SENS-004 hits the flow, editor and time rules', () => {
    const finding = findings.find((f) => f.entityName === 'Sensors');
    assert.ok(finding);
    assert.match(finding.label, /SENS-004/);
    assert.deepEqual(finding.rules, ['impossibleFlow', 'nonPersonEditor', 'quietHours']);
    assert.equal(finding.severity, 3);
    assert.equal(finding.changedBy, 'system');
    assert.equal(finding.changedAt, '2026-11-17T03:13:00.000Z');
  });

  it('stock item Butter hits the stock, editor and time rules', () => {
    const finding = findings.find((f) => f.entityName === 'StockItems');
    assert.ok(finding);
    assert.match(finding.label, /Butter/);
    assert.deepEqual(finding.rules, ['negativeStock', 'nonPersonEditor', 'quietHours']);
    assert.match(finding.reason, /minus 3/);
  });

  it('the SOUTH-BRANCH repair hits the editor and time rules', () => {
    const finding = findings.find((f) => f.entityName === 'Repairs');
    assert.ok(finding);
    assert.equal(finding.recordID, '30000000-0000-4000-8000-000000000006');
    assert.match(finding.label, /SOUTH-BRANCH/);
    assert.deepEqual(finding.rules, ['nonPersonEditor', 'quietHours']);
    assert.equal(finding.severity, 2);
  });

  it('orders by severity, then newest change', () => {
    assert.deepEqual(
      findings.map((f) => f.severity),
      [3, 3, 2],
    );
  });

  it('gives a plain reason with UTC', () => {
    for (const finding of findings) assert.match(finding.reason, /UTC/);
  });
});
