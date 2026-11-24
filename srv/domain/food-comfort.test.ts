import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { comfortLevel, type ComfortLevel } from './food-comfort';

describe('comfortLevel', () => {
  const cases: readonly [string | number, string | number, ComfortLevel][] = [
    [40, 45, 'nervous'],
    [45, 45, 'fine'],
    [22.5, 45, 'nervous'],
    [22.49, 45, 'panic'],
    [5, 12, 'panic'],
    [6, 12, 'nervous'],
    [-3, 12, 'panic'],
    ['12.00', '12', 'fine'],
    [5, 0, 'fine'],
    [0, 0, 'fine'],
    [0, 12, 'panic'],
    [180, 120, 'fine'],
  ];
  for (const [current, minimum, expected] of cases) {
    it(`${current} of minimum ${minimum} is ${expected}`, () => {
      assert.equal(comfortLevel(current, minimum), expected);
    });
  }
});
