import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CONFLICT_FACTOR, flagSourceConflict } from './source-conflict';

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
