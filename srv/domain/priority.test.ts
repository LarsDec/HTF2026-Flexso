import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAX_REPAIRS_PER_DAY, rankPipes, SECONDARY_LOOP_ID, STATUS_ORDER, type AssessedPipe } from './priority';

const pipe = (pipeID: string, status: AssessedPipe['status']): AssessedPipe => ({ pipeID, status });
const order = (pipes: AssessedPipe[], dependants?: Record<string, number | null>): string[] =>
  rankPipes(pipes, dependants).map((r) => r.pipeID);

describe('rankPipes severity', () => {
  it('follows STATUS_ORDER: alarm, unknown, attention, fine', () => {
    assert.deepEqual([...STATUS_ORDER], ['alarm', 'unknown', 'attention', 'fine']);
    assert.deepEqual(order([pipe('A', 'fine'), pipe('B', 'attention'), pipe('C', 'unknown'), pipe('D', 'alarm')]), ['D', 'C', 'B', 'A']);
  });
  it('severity beats the number of families', () => {
    assert.deepEqual(order([pipe('BIG', 'attention'), pipe('SMALL', 'alarm')], { BIG: 1000, SMALL: 1 }), ['SMALL', 'BIG']);
  });
  it('an alarm comes before attention regardless of families', () => {
    assert.deepEqual(order([pipe('NORTH-BRANCH-02', 'attention'), pipe('X', 'alarm')]), ['X', 'NORTH-BRANCH-02']);
  });
});

describe('rankPipes SECONDARY-LOOP', () => {
  it('is last even in alarm', () => {
    assert.deepEqual(order([pipe(SECONDARY_LOOP_ID, 'alarm'), pipe('A', 'fine'), pipe('B', 'attention')]), ['B', 'A', SECONDARY_LOOP_ID]);
  });
  it('is last even with many families', () => {
    assert.deepEqual(order([pipe(SECONDARY_LOOP_ID, 'alarm'), pipe('A', 'alarm')], { [SECONDARY_LOOP_ID]: 999 }), ['A', SECONDARY_LOOP_ID]);
  });
  it('is not in the plan when two other pipes have problems', () => {
    const ranked = rankPipes([pipe(SECONDARY_LOOP_ID, 'alarm'), pipe('A', 'alarm'), pipe('B', 'alarm')]);
    assert.equal(ranked.find((r) => r.pipeID === SECONDARY_LOOP_ID)?.inTodaysPlan, false);
  });
  it('its reason says it is repaired last', () => {
    const ranked = rankPipes([pipe(SECONDARY_LOOP_ID, 'alarm')]);
    assert.match(ranked[0]?.priorityReason ?? '', /always repaired last/);
  });
});

describe('rankPipes plan for today', () => {
  it('holds at most MAX_REPAIRS_PER_DAY pipes', () => {
    assert.equal(MAX_REPAIRS_PER_DAY, 2);
    const ranked = rankPipes([pipe('A', 'alarm'), pipe('B', 'alarm'), pipe('C', 'alarm'), pipe('D', 'attention')]);
    assert.deepEqual(ranked.filter((r) => r.inTodaysPlan).map((r) => r.pipeID), ['A', 'B']);
  });
  it('holds fewer when there are fewer problems', () => {
    const ranked = rankPipes([pipe('A', 'attention'), pipe('B', 'fine')]);
    assert.deepEqual(ranked.filter((r) => r.inTodaysPlan).map((r) => r.pipeID), ['A']);
  });
  it('never holds a fine pipe', () => {
    const ranked = rankPipes([pipe('A', 'fine'), pipe('B', 'fine'), pipe(SECONDARY_LOOP_ID, 'fine')]);
    assert.ok(ranked.every((r) => !r.inTodaysPlan));
    assert.ok(ranked.every((r) => r.priorityReason === 'No action needed.'));
  });
  it('an unknown pipe is eligible for the plan', () => {
    assert.equal(rankPipes([pipe('A', 'unknown')])[0]?.inTodaysPlan, true);
  });
});

describe('rankPipes tie-break', () => {
  it('more dependants first among equal statuses', () => {
    assert.deepEqual(order([pipe('A', 'alarm'), pipe('B', 'alarm'), pipe('C', 'alarm')], { A: 10, B: 50, C: 30 }), ['B', 'C', 'A']);
  });
  it('known dependants before unknown ones', () => {
    assert.deepEqual(order([pipe('A', 'alarm'), pipe('NORTH-BRANCH-02', 'alarm')]), ['NORTH-BRANCH-02', 'A']);
    assert.deepEqual(order([pipe('A', 'alarm'), pipe('B', 'alarm')], { A: null, B: 5 }), ['B', 'A']);
  });
  it('falls back to pipeID when dependants are equal or both unknown', () => {
    assert.deepEqual(order([pipe('B', 'alarm'), pipe('A', 'alarm')]), ['A', 'B']);
    assert.deepEqual(order([pipe('B', 'alarm'), pipe('A', 'alarm')], { A: 7, B: 7 }), ['A', 'B']);
  });
  it('ranks are 1-based and consecutive', () => {
    const ranked = rankPipes([pipe('A', 'fine'), pipe('B', 'alarm'), pipe('C', 'attention')]);
    assert.deepEqual(ranked.map((r) => r.priorityRank), [1, 2, 3]);
  });
  it('returns an empty list for no pipes and does not mutate the input', () => {
    assert.deepEqual(rankPipes([]), []);
    const input = [pipe('B', 'fine'), pipe('A', 'alarm')];
    rankPipes(input);
    assert.deepEqual(input.map((p) => p.pipeID), ['B', 'A']);
  });
});

describe('rankPipes reasons', () => {
  it('uses the words of the villagers for known pipes and admits unknown families', () => {
    const reasons = new Map(
      rankPipes([pipe('SOUTH-BRANCH', 'alarm'), pipe('BAKERY-BRANCH', 'alarm'), pipe('X', 'alarm')]).map((r) => [r.pipeID, r.priorityReason]),
    );
    assert.match(reasons.get('SOUTH-BRANCH') ?? '', /South Meadow Farms animals manage about half a day/);
    assert.match(reasons.get('BAKERY-BRANCH') ?? '', /bread for the whole village/);
    assert.match(reasons.get('X') ?? '', /number of affected families unknown/);
  });
});
