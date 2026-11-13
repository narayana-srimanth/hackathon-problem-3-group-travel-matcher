const { evaluateMatch } = require('../../src/domain/matching');
const { scoreMatch, compareIds, compareMatches, rankMatches } = require('../../src/domain/ranking');
const { RANK_WEIGHTS } = require('../../src/domain/constants');
const { PRIYA_SEARCH, group, ownerOf } = require('../helpers/fixtures');

const scoreOf = (id) => {
  const g = group(id);
  return scoreMatch(evaluateMatch(PRIYA_SEARCH, g, ownerOf(g)), PRIYA_SEARCH, g);
};

test('weights sum to 1', () => {
  const sum = Object.values(RANK_WEIGHTS).reduce((a, b) => a + b, 0);
  expect(sum).toBeCloseTo(1, 10);
});

describe('scores from the architecture doc §4.4', () => {
  test('G-01: interests 2/5, dates 5/7, budget 1 − 2000/24000, space 1/2 → 63', () => {
    const { score, components } = scoreOf('G-01');
    expect(components.interests).toBeCloseTo(0.4, 10);
    expect(components.dates).toBeCloseTo(5 / 7, 10);
    expect(components.budget).toBeCloseTo(1 - 2000 / 24000, 10);
    expect(components.space).toBeCloseTo(0.5, 10);
    expect(score).toBe(63);
  });

  test('G-08: interests 2/4, dates 4/7, budget 1 − 7000/22000, space 2/3 → 58', () => {
    const { score, components } = scoreOf('G-08');
    expect(components.interests).toBeCloseTo(0.5, 10);
    expect(components.dates).toBeCloseTo(4 / 7, 10);
    expect(components.budget).toBeCloseTo(1 - 7000 / 22000, 10);
    expect(components.space).toBeCloseTo(2 / 3, 10);
    expect(score).toBe(58);
  });

  test('components of a non-eligible group are clamped to [0, 1]', () => {
    // G-04 is over the budget limit and G-07 is full
    for (const id of ['G-04', 'G-07']) {
      for (const value of Object.values(scoreOf(id).components)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  test('the same budget and identical trips score 100', () => {
    const g = {
      groupId: 'G-900',
      city: 'Kyoto',
      checkIn: '2027-04-09',
      checkOut: '2027-04-16',
      budgetInr: 62000,
      maxSize: 4,
      memberIds: ['T-9'],
    };
    const owner = { interests: PRIYA_SEARCH.interests, gender: 'FEMALE', genderPreference: 'SAME_GENDER' };
    const e = evaluateMatch(PRIYA_SEARCH, g, owner);
    // space is 2/3 (2 places left of 3), everything else is 1
    expect(scoreMatch(e, PRIYA_SEARCH, g).score).toBe(Math.round(100 * (0.35 + 0.3 + 0.25 + 0.1 * (2 / 3))));
  });
});

describe('compareIds', () => {
  test('numeric order, not text order', () => {
    expect(['G-10', 'G-9', 'G-1001', 'G-01'].sort(compareIds)).toEqual(['G-01', 'G-9', 'G-10', 'G-1001']);
  });
});

describe('tie-breaking: score ↓, shared interests ↓, shared nights ↓, checkIn ↑, groupId ↑', () => {
  const m = (groupId, score, sharedCount, sharedNights, checkIn = '2027-04-10') => ({
    score,
    group: { groupId, checkIn },
    evaluation: { facts: { shared: Array(sharedCount).fill('X'), sharedNights } },
  });
  const order = (list) => [...list].sort(compareMatches).map((x) => x.group.groupId);

  test('higher score first', () =>
    expect(order([m('G-1', 50, 2, 2), m('G-2', 60, 2, 2)])).toEqual(['G-2', 'G-1']));
  test('then more shared interests', () =>
    expect(order([m('G-1', 50, 2, 2), m('G-2', 50, 3, 2)])).toEqual(['G-2', 'G-1']));
  test('then more shared nights', () =>
    expect(order([m('G-1', 50, 2, 2), m('G-2', 50, 2, 4)])).toEqual(['G-2', 'G-1']));
  test('then the earlier check-in', () =>
    expect(order([m('G-1', 50, 2, 2, '2027-04-12'), m('G-2', 50, 2, 2, '2027-04-05')])).toEqual([
      'G-2',
      'G-1',
    ]));
  test('then the lower groupId', () =>
    expect(order([m('G-10', 50, 2, 2), m('G-9', 50, 2, 2)])).toEqual(['G-9', 'G-10']));
});

test('ranking is deterministic whatever the input order', () => {
  const ids = ['G-08', 'G-01', 'G-04', 'G-02', 'G-06'];
  const evaluated = ids.map((id) => {
    const g = group(id);
    return { group: g, owner: ownerOf(g), evaluation: evaluateMatch(PRIYA_SEARCH, g, ownerOf(g)) };
  });
  const forward = rankMatches(PRIYA_SEARCH, evaluated).map((x) => x.group.groupId);
  const backward = rankMatches(PRIYA_SEARCH, [...evaluated].reverse()).map((x) => x.group.groupId);
  expect(forward).toEqual(['G-01', 'G-08']);
  expect(backward).toEqual(forward);
});
