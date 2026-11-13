const {
  evaluateMatch,
  matchReasons,
  notEligibleDetails,
  genderComposition,
  budgetWithinTolerance,
} = require('../../src/domain/matching');
const { rankMatches } = require('../../src/domain/ranking');
const { RULE_ORDER } = require('../../src/domain/constants');
const { PRIYA_SEARCH, group, ownerOf, candidates } = require('../helpers/fixtures');

const evaluate = (search, g) => evaluateMatch(search, g, ownerOf(g));
const evaluateAll = (search) =>
  candidates().map((c) => ({ ...c, evaluation: evaluateMatch(search, c.group, c.owner) }));

// A synthetic group + owner that matches PRIYA_SEARCH on every rule; tests change one thing at a time
const baseGroup = (over = {}) => ({
  groupId: 'G-900',
  city: 'Kyoto',
  checkIn: '2027-04-10',
  checkOut: '2027-04-15',
  budgetInr: 60000,
  maxSize: 3,
  memberIds: ['T-900'],
  ...over,
});
const baseOwner = (over = {}) => ({
  interests: ['TEMPLES', 'STREET_FOOD', 'PHOTOGRAPHY'],
  gender: 'FEMALE',
  genderPreference: 'SAME_GENDER',
  ...over,
});
const failedFor = (search, g = baseGroup(), o = baseOwner()) => evaluateMatch(search, g, o).failed;

describe('golden #1–2: Priya against the 12 seed groups', () => {
  test('#1 exactly G-01 and G-08 match, G-01 first', () => {
    const ranked = rankMatches(PRIYA_SEARCH, evaluateAll(PRIYA_SEARCH));
    expect(ranked.map((m) => m.group.groupId)).toEqual(['G-01', 'G-08']);
    expect(ranked.map((m) => m.score)).toEqual([63, 58]);
  });

  test.each([
    ['G-02', ['DATES_OVERLAP']],
    ['G-03', ['SAME_CITY']],
    ['G-04', ['BUDGET']],
    ['G-05', ['SHARED_INTERESTS']],
    ['G-06', ['GENDER']],
    ['G-07', ['GROUP_SIZE']],
  ])('#2 %s fails exactly %p', (id, failed) => {
    const e = evaluate(PRIYA_SEARCH, group(id));
    expect(e.eligible).toBe(false);
    expect(e.failed).toEqual(failed);
  });

  test('every evaluation has 6 checks in the fixed order, even when several rules fail', () => {
    for (const { evaluation } of evaluateAll(PRIYA_SEARCH)) {
      expect(evaluation.checks.map((c) => c.rule)).toEqual(RULE_ORDER);
      expect(evaluation.failed).toEqual(evaluation.checks.filter((c) => !c.passed).map((c) => c.rule));
    }
    // G-11 (Abu Dhabi, male owner, different interests) fails several rules at once
    expect(evaluate(PRIYA_SEARCH, group('G-11')).failed.length).toBeGreaterThan(1);
  });
});

describe('API spec examples', () => {
  test('E14: Priya against G-04 Kyoto Ryokan Retreat', () => {
    const { eligible, failed, checks } = evaluate(PRIYA_SEARCH, group('G-04'));
    expect({ eligible, failed, checks }).toEqual({
      eligible: false,
      failed: ['BUDGET'],
      checks: [
        { rule: 'SAME_CITY', passed: true, message: 'Both going to Kyoto' },
        { rule: 'DATES_OVERLAP', passed: true, sharedNights: 4, message: '4 shared nights (10–14 Apr)' },
        {
          rule: 'BUDGET',
          passed: false,
          diffInr: 25000,
          limitInr: 24800,
          message: 'Budgets differ by ₹25,000; the limit is ₹24,800',
        },
        {
          rule: 'SHARED_INTERESTS',
          passed: true,
          shared: ['STREET_FOOD', 'TEMPLES'],
          message: '2 shared interests',
        },
        { rule: 'GENDER', passed: true, message: 'Female only ↔ female only' },
        { rule: 'GROUP_SIZE', passed: true, freeAfterJoin: 1, message: '1 place left after you join' },
      ],
    });
  });

  test('E11: match reasons for G-01', () => {
    const e = evaluate(PRIYA_SEARCH, group('G-01'));
    expect(matchReasons(e, PRIYA_SEARCH, ownerOf(group('G-01')))).toEqual({
      sharedNights: 5,
      sharedFrom: '2027-04-10',
      sharedTo: '2027-04-15',
      sharedInterests: ['TEMPLES', 'STREET_FOOD'],
      budgetDiffInr: 2000,
      budgetLimitInr: 24000,
      gender: 'Female only ↔ female only',
      spotsAfterJoin: 1,
    });
  });

  test('NOT_ELIGIBLE details for a forged G-06 request', () => {
    expect(notEligibleDetails(evaluate(PRIYA_SEARCH, group('G-06')))).toEqual([
      { rule: 'GENDER', issue: 'The group owner is male and your preference is female only' },
    ]);
  });
});

describe('golden #3: budget, 40% of the lower budget, inclusive', () => {
  const withBudgets = (seeker, groupBudget) =>
    failedFor({ ...PRIYA_SEARCH, budgetInr: seeker }, baseGroup({ budgetInr: groupBudget }));

  test('60,000 vs 62,000 → match', () => expect(withBudgets(62000, 60000)).toEqual([]));
  test('60,000 vs 84,000 (exactly 40%) → match', () => expect(withBudgets(84000, 60000)).toEqual([]));
  test('60,000 vs 85,000 → no match', () => expect(withBudgets(85000, 60000)).toEqual(['BUDGET']));
  test('the rule is symmetric (seeker lower)', () => {
    expect(withBudgets(60000, 84000)).toEqual([]);
    expect(withBudgets(60000, 85000)).toEqual(['BUDGET']);
  });
  test('one rupee over the limit fails', () => {
    expect(withBudgets(84001, 60000)).toEqual(['BUDGET']);
  });
  test('integer arithmetic is exact where floats are not', () => {
    // 0.4 × 3 = 1.2000000000000002 in floats; the integer form still accepts diff 1.2 × 10
    expect(budgetWithinTolerance(12, 30)).toBe(true);
    expect(budgetWithinTolerance(13, 30)).toBe(false);
  });
  test('limitInr is floor(40% × lower)', () => {
    const e = evaluateMatch(
      { ...PRIYA_SEARCH, budgetInr: 1001 },
      baseGroup({ budgetInr: 1001 }),
      baseOwner(),
    );
    expect(e.checks[2].limitInr).toBe(400);
  });
});

describe('golden #4: shared nights', () => {
  const withDates = (checkIn, checkOut) => failedFor({ ...PRIYA_SEARCH, checkIn, checkOut });

  test('exactly 2 shared nights → match', () => expect(withDates('2027-04-13', '2027-04-18')).toEqual([]));
  test('exactly 1 shared night → no match', () =>
    expect(withDates('2027-04-14', '2027-04-18')).toEqual(['DATES_OVERLAP']));
  test('back-to-back (0 nights) → no match', () =>
    expect(withDates('2027-04-15', '2027-04-18')).toEqual(['DATES_OVERLAP']));
  test('messages', () => {
    const one = evaluateMatch(
      { ...PRIYA_SEARCH, checkIn: '2027-04-14', checkOut: '2027-04-18' },
      baseGroup(),
      baseOwner(),
    );
    expect(one.checks[1].message).toBe('Only 1 shared night (14–15 Apr); at least 2 needed');
    const none = evaluateMatch(
      { ...PRIYA_SEARCH, checkIn: '2027-04-15', checkOut: '2027-04-18' },
      baseGroup(),
      baseOwner(),
    );
    expect(none.checks[1].message).toBe('No shared nights; at least 2 needed');
  });
});

describe('golden #5: shared interests (with the owner)', () => {
  const withInterests = (interests) => failedFor({ ...PRIYA_SEARCH, interests });

  test('2 shared → match', () => expect(withInterests(['TEMPLES', 'STREET_FOOD'])).toEqual([]));
  test('1 shared → no match', () =>
    expect(withInterests(['TEMPLES', 'HIKING'])).toEqual(['SHARED_INTERESTS']));
  test('0 shared → no match', () => expect(withInterests(['HIKING'])).toEqual(['SHARED_INTERESTS']));
  test('the same interest twice counts once (seeker side)', () => {
    expect(withInterests(['TEMPLES', 'TEMPLES', 'HIKING'])).toEqual(['SHARED_INTERESTS']);
  });
  test('the same interest twice counts once (owner side)', () => {
    const owner = baseOwner({ interests: ['TEMPLES', 'TEMPLES'] });
    expect(failedFor({ ...PRIYA_SEARCH, interests: ['TEMPLES', 'HIKING'] }, baseGroup(), owner)).toEqual([
      'SHARED_INTERESTS',
    ]);
  });
  test('shared interests are listed once, in the owner order', () => {
    const e = evaluateMatch(
      { ...PRIYA_SEARCH, interests: ['PHOTOGRAPHY', 'TEMPLES', 'TEMPLES'] },
      baseGroup(),
      baseOwner(),
    );
    expect(e.checks[3].shared).toEqual(['TEMPLES', 'PHOTOGRAPHY']);
  });
});

describe('golden #6: gender matrix', () => {
  const pair = (seekerGender, seekerPref, ownerGender, ownerPref) =>
    evaluateMatch(
      { ...PRIYA_SEARCH, gender: seekerGender, genderPreference: seekerPref },
      baseGroup(),
      baseOwner({ gender: ownerGender, genderPreference: ownerPref }),
    );

  test.each([
    ['FEMALE', 'SAME_GENDER', 'FEMALE', 'SAME_GENDER', true],
    ['FEMALE', 'ANY', 'MALE', 'ANY', true],
    ['MALE', 'ANY', 'FEMALE', 'SAME_GENDER', false], // the owner doesn't allow a man
    ['FEMALE', 'SAME_GENDER', 'MALE', 'ANY', false], // the seeker doesn't allow a man (G-06)
    ['MALE', 'SAME_GENDER', 'MALE', 'SAME_GENDER', true],
    ['MALE', 'SAME_GENDER', 'FEMALE', 'ANY', false],
  ])('seeker %s/%s vs owner %s/%s → %p', (sg, sp, og, op, expected) => {
    expect(pair(sg, sp, og, op).checks[4].passed).toBe(expected);
  });

  test('owner-side failure message', () => {
    expect(pair('MALE', 'ANY', 'FEMALE', 'SAME_GENDER').checks[4].message).toBe(
      'The group owner prefers female travellers only',
    );
  });

  test('both sides failing are both explained', () => {
    expect(pair('MALE', 'SAME_GENDER', 'FEMALE', 'SAME_GENDER').checks[4].message).toBe(
      'The group owner is female and your preference is male only; The group owner prefers female travellers only',
    );
  });

  test('labels', () => {
    expect(pair('FEMALE', 'ANY', 'MALE', 'ANY').checks[4].message).toBe('Anyone ↔ anyone');
    expect(pair('MALE', 'ANY', 'MALE', 'SAME_GENDER').checks[4].message).toBe('Anyone ↔ male only');
  });
});

describe('golden #7: group size', () => {
  test('2 of 3 members → match, taking the last place', () => {
    const e = evaluateMatch(PRIYA_SEARCH, baseGroup({ memberIds: ['T-900', 'T-901'] }), baseOwner());
    expect(e.eligible).toBe(true);
    expect(e.checks[5]).toMatchObject({ freeAfterJoin: 0, message: 'You would take the last place' });
  });

  test('3 of 3 members → no match', () => {
    const e = evaluateMatch(PRIYA_SEARCH, baseGroup({ memberIds: ['T-900', 'T-901', 'T-902'] }), baseOwner());
    expect(e.failed).toEqual(['GROUP_SIZE']);
    expect(e.checks[5].message).toBe('The group is full (3 of 3)');
  });

  test('a group of 1 (owner only, maxSize 1) never matches', () => {
    expect(failedFor(PRIYA_SEARCH, baseGroup({ maxSize: 1 }))).toEqual(['GROUP_SIZE']);
  });
});

describe('golden #8: same city', () => {
  test('Kyoto vs Osaka with everything else identical → no match', () => {
    const e = evaluateMatch(PRIYA_SEARCH, baseGroup({ city: 'Osaka' }), baseOwner());
    expect(e.failed).toEqual(['SAME_CITY']);
    expect(e.checks[0].message).toBe('This group is going to Osaka, not Kyoto');
  });

  test('the city comparison is exact', () => {
    expect(failedFor(PRIYA_SEARCH, baseGroup({ city: 'kyoto' }))).toEqual(['SAME_CITY']);
  });
});

describe('golden #9: interests are compared with the owner only', () => {
  test('G-05 has 2 members and still fails on the owner', () => {
    expect(group('G-05').memberIds).toHaveLength(2);
    expect(evaluate(PRIYA_SEARCH, group('G-05')).failed).toEqual(['SHARED_INTERESTS']);
  });

  test('other members’ interests are ignored', () => {
    // the group's other member could share everything; only the owner profile is passed in
    const owner = baseOwner({ interests: ['HIKING', 'MUSEUMS'] });
    const g = baseGroup({ memberIds: ['T-900', 'T-002'] });
    expect(evaluateMatch(PRIYA_SEARCH, g, owner).failed).toEqual(['SHARED_INTERESTS']);
  });
});

describe('genderComposition (G1)', () => {
  test.each([
    [['FEMALE'], 'ALL_FEMALE'],
    [['FEMALE', 'FEMALE'], 'ALL_FEMALE'],
    [['MALE', 'MALE'], 'ALL_MALE'],
    [['FEMALE', 'MALE'], 'MIXED'],
  ])('%p → %s', (genders, expected) => {
    expect(genderComposition(genders)).toBe(expected);
  });
});
