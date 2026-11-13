const { evaluateMatch, budgetWithinTolerance } = require('../../src/domain/matching');
const { buildEmptyStateHints, suggestDates, suggestBudget } = require('../../src/domain/hints');
const { PRIYA_SEARCH, group, ownerOf, candidates, interestLabels: L } = require('../helpers/fixtures');

const evaluated = (search, ids) =>
  ids.map((id) => {
    const g = group(id);
    return { group: g, owner: ownerOf(g), evaluation: evaluateMatch(search, g, ownerOf(g)) };
  });
const hintsFor = (search, ids) => buildEmptyStateHints(search, evaluated(search, ids), { interestLabels: L });

describe('one hint per near miss', () => {
  test('WIDEN_DATES (the API spec example)', () => {
    expect(hintsFor(PRIYA_SEARCH, ['G-02'])).toEqual([
      {
        type: 'WIDEN_DATES',
        groupId: 'G-02',
        message: 'Kyoto Late Bloom shares only 1 night; a check-out of 17 Apr would share 2.',
      },
    ]);
  });

  test('ADJUST_BUDGET up (seeker is the lower budget)', () => {
    expect(hintsFor(PRIYA_SEARCH, ['G-04'])).toEqual([
      {
        type: 'ADJUST_BUDGET',
        groupId: 'G-04',
        message: "Kyoto Ryokan Retreat's budget is ₹87,000; a budget of ₹62,143 or more would match.",
      },
    ]);
  });

  test('ADD_INTERESTS names the owner interests to add', () => {
    expect(hintsFor(PRIYA_SEARCH, ['G-05'])).toEqual([
      {
        type: 'ADD_INTERESTS',
        groupId: 'G-05',
        message: `Kyoto Trails and Shrines shares only ${L.TEMPLES}; adding one of ${L.HIKING} or ${L.MUSEUMS} would match.`,
      },
    ]);
  });

  test('OTHER_CITY for a group that fails only the city', () => {
    expect(hintsFor(PRIYA_SEARCH, ['G-03'])).toEqual([
      {
        type: 'OTHER_CITY',
        groupId: 'G-03',
        message: 'Osaka Food and Temples in Osaka matches everything except the city.',
      },
    ]);
  });

  test('no hint for GENDER or GROUP_SIZE (the seeker cannot change them)', () => {
    expect(hintsFor(PRIYA_SEARCH, ['G-06', 'G-07'])).toEqual([]);
  });

  test('no hint for a group failing two rules', () => {
    // G-11: Abu Dhabi, male owner, other interests
    expect(hintsFor(PRIYA_SEARCH, ['G-11'])).toEqual([]);
  });
});

describe('limits and order', () => {
  test('at most 3 hints, best-scoring near misses first', () => {
    const all = buildEmptyStateHints(
      PRIYA_SEARCH,
      candidates().map((c) => ({ ...c, evaluation: evaluateMatch(PRIYA_SEARCH, c.group, c.owner) })),
      { interestLabels: L },
    );
    expect(all).toHaveLength(3);
    expect(new Set(all.map((h) => h.groupId)).size).toBe(3);
    expect(all.every((h) => ['G-02', 'G-03', 'G-04', 'G-05'].includes(h.groupId))).toBe(true);
  });

  test('a 1-night search always gets the general hint first', () => {
    const oneNight = { ...PRIYA_SEARCH, checkIn: '2027-04-12', checkOut: '2027-04-13' };
    const hints = hintsFor(oneNight, ['G-01']);
    expect(hints[0]).toEqual({ type: 'WIDEN_DATES', message: 'Stay at least 2 nights to match a group.' });
    // and G-01 (fails only the dates now) still gets its own hint
    expect(hints[1]).toMatchObject({ type: 'WIDEN_DATES', groupId: 'G-01' });
  });

  test('labels fall back to interest ids', () => {
    const [hint] = buildEmptyStateHints(PRIYA_SEARCH, evaluated(PRIYA_SEARCH, ['G-05']));
    expect(hint.message).toContain('adding one of HIKING or MUSEUMS');
  });
});

describe('suggestDates', () => {
  const stay = (checkIn, checkOut) => ({ checkIn, checkOut });

  test('extends the check-out when the group is later', () => {
    expect(suggestDates(stay('2027-04-09', '2027-04-16'), stay('2027-04-15', '2027-04-18'))).toMatchObject({
      field: 'checkOut',
      date: '2027-04-17',
      shared: 2,
    });
  });

  test('moves the check-in earlier when the group is earlier', () => {
    expect(suggestDates(stay('2027-04-03', '2027-04-05'), stay('2027-04-01', '2027-04-03'))).toMatchObject({
      field: 'checkIn',
      date: '2027-04-01',
      shared: 2,
    });
  });

  test('picks the smaller change', () => {
    // group 10→16; search 13→18 shares 3 with MIN 2 → fine, so use 15→18 (shares 1):
    // an earlier check-in (14 Apr, 1 day) beats any later check-out (the group ends on 16 Apr)
    expect(suggestDates(stay('2027-04-15', '2027-04-18'), stay('2027-04-10', '2027-04-16'))).toMatchObject({
      field: 'checkIn',
      date: '2027-04-14',
    });
  });

  test('on a tie, prefers moving the check-out', () => {
    // a 1-night stay inside the group: check-out +1 and check-in −1 both give 2 nights
    expect(suggestDates(stay('2027-04-12', '2027-04-13'), stay('2027-04-10', '2027-04-16'))).toMatchObject({
      field: 'checkOut',
      date: '2027-04-14',
    });
  });

  test('null when the group itself is shorter than the minimum', () => {
    expect(suggestDates(stay('2027-04-05', '2027-04-08'), stay('2027-04-10', '2027-04-11'))).toBeNull();
  });

  test('stays inside the data window', () => {
    // group 18→20, search 01→05: the check-out may move to 20 Apr at most → shares 2
    expect(suggestDates(stay('2027-04-01', '2027-04-05'), stay('2027-04-18', '2027-04-20'))).toMatchObject({
      field: 'checkOut',
      date: '2027-04-20',
    });
  });
});

describe('suggestBudget', () => {
  test('the suggested lower bound is the smallest budget that passes', () => {
    const { budget, direction } = suggestBudget(62000, 87000);
    expect(direction).toBe('or more');
    expect(budgetWithinTolerance(87000 - budget, budget)).toBe(true);
    expect(budgetWithinTolerance(87000 - (budget - 1), budget - 1)).toBe(false);
  });

  test('the suggested upper bound is the largest budget that passes', () => {
    expect(suggestBudget(90000, 60000)).toEqual({ budget: 84000, direction: 'or less' });
    expect(budgetWithinTolerance(84000 - 60000, 60000)).toBe(true);
    expect(budgetWithinTolerance(84001 - 60000, 60000)).toBe(false);
  });
});
