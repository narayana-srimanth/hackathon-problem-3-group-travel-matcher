const { useTestApp } = require('../helpers/testApp');
const { Group, JoinRequest } = require('../../src/models');

jest.setTimeout(30000);
const t = useTestApp('searches');

const PRIYA_PROFILE = Object.freeze({
  name: 'Priya Nair',
  age: 26,
  gender: 'FEMALE',
  homeCity: 'Mumbai',
  interests: ['TEMPLES', 'STREET_FOOD', 'ADVENTURE'],
  genderPreference: 'SAME_GENDER',
});
// Priya's search from the brief / API spec E11
const PRIYA_SEARCH = Object.freeze({
  homeCity: 'Mumbai',
  city: 'Kyoto',
  checkIn: '2027-04-09',
  checkOut: '2027-04-16',
  interests: ['TEMPLES', 'STREET_FOOD', 'ADVENTURE'],
  budgetInr: 62000,
  genderPreference: 'SAME_GENDER',
});

let priya; // travellerId of the freshly signed-up Priya
const signUpPriya = async () => {
  priya = (await t.post('/api/v1/travellers', PRIYA_PROFILE)).body.traveller.travellerId;
};
const search = (body, as = priya) => t.post('/api/v1/searches', body, as);
const ids = (page) => page.items.map((m) => m.groupId);

const G01_CARD = {
  groupId: 'G-01',
  name: 'Kyoto Spring Temples',
  city: 'Kyoto',
  checkIn: '2027-04-10',
  checkOut: '2027-04-15',
  memberCount: 1,
  maxSize: 3,
  freeSpots: 2,
  budgetInr: 60000,
  owner: { travellerId: 'T-001', name: 'Sarah Thomas' },
  score: 63,
  reasons: {
    sharedNights: 5,
    sharedFrom: '2027-04-10',
    sharedTo: '2027-04-15',
    sharedInterests: ['TEMPLES', 'STREET_FOOD'],
    budgetDiffInr: 2000,
    budgetLimitInr: 24000,
    gender: 'Female only ↔ female only',
    spotsAfterJoin: 1,
  },
  viewerRequestStatus: null,
};

describe('E11 POST /searches', () => {
  beforeAll(async () => {
    await t.reset();
    await signUpPriya();
  });

  test("Priya's search: exactly G-01 then G-08, as in the API spec", async () => {
    const res = await search(PRIYA_SEARCH);
    expect(res.status).toBe(201);
    expect(res.body.search).toEqual({
      searchId: 'S-1001',
      travellerId: priya,
      homeCity: 'Mumbai',
      city: 'Kyoto',
      checkIn: '2027-04-09',
      checkOut: '2027-04-16',
      nights: 7,
      interests: ['TEMPLES', 'STREET_FOOD', 'ADVENTURE'],
      budgetInr: 62000,
      gender: 'FEMALE', // from the profile
      genderPreference: 'SAME_GENDER',
      createdAt: expect.stringMatching(/Z$/),
    });
    expect(res.body.matches).toMatchObject({ page: 1, limit: 20, total: 2 });
    expect(ids(res.body.matches)).toEqual(['G-01', 'G-08']);
    expect(res.body.matches.items[0]).toEqual(G01_CARD);
    expect(res.body.matches.items[1]).toMatchObject({ groupId: 'G-08', score: 58 });
    expect(res.body.emptyStateHints).toEqual([]);
  });

  test('limit sets the size of the embedded first page', async () => {
    const res = await search({ ...PRIYA_SEARCH, limit: 1 });
    expect(res.body.matches).toMatchObject({ page: 1, limit: 1, total: 2 });
    expect(ids(res.body.matches)).toEqual(['G-01']);
  });

  test('the owner never matches their own group (Sarah searching Kyoto)', async () => {
    const res = await search(
      { ...PRIYA_SEARCH, homeCity: 'Bengaluru', interests: ['TEMPLES', 'STREET_FOOD', 'PHOTOGRAPHY'] },
      'T-001',
    );
    expect(res.status).toBe(201);
    expect(ids(res.body.matches)).not.toContain('G-01');
  });

  test('a FULL group never matches (G-07), and results are live: a group that fills drops out', async () => {
    const first = await search(PRIYA_SEARCH);
    expect(ids(first.body.matches)).not.toContain('G-07');

    await Group.updateOne({ groupId: 'G-08' }, { $set: { status: 'FULL' } });
    const res = await t.get(`/api/v1/searches/${first.body.search.searchId}/matches`, priya);
    expect(ids(res.body.matches)).toEqual(['G-01']);
    await Group.updateOne({ groupId: 'G-08' }, { $set: { status: 'OPEN' } });
  });

  test('a male seeker gets no female-only groups', async () => {
    const ravi = (
      await t.post('/api/v1/travellers', {
        ...PRIYA_PROFILE,
        name: 'Ravi',
        gender: 'MALE',
        genderPreference: 'ANY',
      })
    ).body.traveller.travellerId;
    const res = await search({ ...PRIYA_SEARCH, genderPreference: 'ANY' }, ravi);
    expect(res.body.search.gender).toBe('MALE');
    // G-06 (male owner, ANY) is the only Kyoto group a man could join, and its dates/interests fit
    expect(ids(res.body.matches)).toEqual(['G-06']);
  });

  describe('empty results come with hints', () => {
    test('dates that miss by one night → WIDEN_DATES (the API spec example)', async () => {
      const res = await search({ ...PRIYA_SEARCH, checkIn: '2027-04-14', checkOut: '2027-04-16' });
      expect(res.body.matches.total).toBe(0);
      expect(res.body.emptyStateHints.length).toBeLessThanOrEqual(3);
      expect(res.body.emptyStateHints).toContainEqual({
        type: 'WIDEN_DATES',
        groupId: 'G-02',
        message: 'Kyoto Late Bloom shares only 1 night; a check-out of 17 Apr would share 2.',
      });
      expect(res.body.emptyStateHints.every((h) => h.type === 'WIDEN_DATES')).toBe(true);
    });

    test('a 1-night search always gets the general hint first', async () => {
      const res = await search({ ...PRIYA_SEARCH, checkIn: '2027-04-12', checkOut: '2027-04-13' });
      expect(res.body.matches.total).toBe(0);
      expect(res.body.emptyStateHints[0]).toEqual({
        type: 'WIDEN_DATES',
        message: 'Stay at least 2 nights to match a group.',
      });
    });

    test('no match in Tokyo → OTHER_CITY points at the Kyoto groups', async () => {
      const res = await search({ ...PRIYA_SEARCH, city: 'Tokyo' });
      expect(res.body.matches.total).toBe(0);
      const otherCity = res.body.emptyStateHints.filter((h) => h.type === 'OTHER_CITY');
      expect(otherCity.map((h) => h.groupId)).toEqual(expect.arrayContaining(['G-01', 'G-08']));
      expect(otherCity[0].message).toMatch(/matches everything except the city\.$/);
    });
  });

  test.each([
    ['gender is not accepted (it comes from the profile)', { gender: 'MALE' }, 'gender'],
    ['unknown preference', { genderPreference: 'FEMALE' }, 'genderPreference'],
    ['budget below 1,000', { budgetInr: 999 }, 'budgetInr'],
    ['no interests', { interests: [] }, 'interests'],
    ['limit above 50', { limit: 51 }, 'limit'],
    ['check-out not after check-in', { checkOut: '2027-04-09' }, 'checkOut'],
    ['impossible date', { checkIn: '2027-02-30' }, 'checkIn'],
    ['home city outside India list', { homeCity: 'Pune' }, 'homeCity'],
    ['unknown interest', { interests: ['TEMPLES', 'SKYDIVING'] }, 'interests.1'],
  ])('400 VALIDATION_ERROR: %s', async (_name, change, field) => {
    const res = await search({ ...PRIYA_SEARCH, ...change });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d) => d.field)).toContain(field);
  });

  test.each([
    ['a city outside the 5', { city: 'Bangkok' }],
    ['dates outside the window', { checkIn: '2027-04-18', checkOut: '2027-04-22' }],
  ])('422 OUT_OF_DATA_RANGE: %s', async (_name, change) => {
    const res = await search({ ...PRIYA_SEARCH, ...change });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('OUT_OF_DATA_RANGE');
  });

  test('400 (unknown interest) wins over 422 (city)', async () => {
    const res = await search({ ...PRIYA_SEARCH, city: 'Bangkok', interests: ['SKYDIVING'] });
    expect(res.status).toBe(400);
  });

  test('401 without the identity header', async () => {
    expect((await search(PRIYA_SEARCH, null)).status).toBe(401);
  });
});

describe('E12 GET /searches/:searchId', () => {
  let searchId;
  beforeAll(async () => {
    await t.reset();
    await signUpPriya();
    searchId = (await search(PRIYA_SEARCH)).body.search.searchId;
  });

  test('restores the stored search for its owner', async () => {
    const res = await t.get(`/api/v1/searches/${searchId}`, priya);
    expect(res.status).toBe(200);
    expect(res.body.search).toMatchObject({ searchId, city: 'Kyoto', nights: 7, budgetInr: 62000 });
  });

  test('403 for another traveller', async () => {
    const res = await t.get(`/api/v1/searches/${searchId}`, 'T-001');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test.each(['S-9999', 'S-x'])('404 for unknown or malformed %s', async (id) => {
    expect((await t.get(`/api/v1/searches/${id}`, priya)).status).toBe(404);
  });

  test('401 without the identity header', async () => {
    expect((await t.get(`/api/v1/searches/${searchId}`)).status).toBe(401);
  });
});

describe('E13 GET /searches/:searchId/matches', () => {
  let searchId;
  const matches = (qs = '', as = priya) => t.get(`/api/v1/searches/${searchId}/matches${qs}`, as);

  beforeAll(async () => {
    await t.reset();
    await signUpPriya();
    searchId = (await search(PRIYA_SEARCH)).body.search.searchId;
  });

  test('the same ranked results as E11', async () => {
    const res = await matches();
    expect(res.status).toBe(200);
    expect(ids(res.body.matches)).toEqual(['G-01', 'G-08']);
    expect(res.body.matches.items[0]).toEqual(G01_CARD);
  });

  test('pagination', async () => {
    const res = await matches('?page=2&limit=1');
    expect(res.body.matches).toMatchObject({ page: 2, limit: 1, total: 2 });
    expect(ids(res.body.matches)).toEqual(['G-08']);
  });

  test.each([
    ['?sharedInterest=TEMPLES', ['G-01', 'G-08']],
    ['?sharedInterest=TEMPLES&sharedInterest=STREET_FOOD', ['G-01', 'G-08']],
    ['?sharedInterest=PHOTOGRAPHY', []], // Priya doesn't have it, so no group can share it with her
    ['?genderComposition=ALL_FEMALE', ['G-01', 'G-08']],
    ['?genderComposition=ALL_MALE', []],
    ['?genderComposition=MIXED', []],
    ['?sharedInterest=TEMPLES&genderComposition=ALL_FEMALE&limit=1', ['G-01']],
  ])('G1 filter %s', async (qs, expected) => {
    const res = await matches(qs);
    expect(res.status).toBe(200);
    expect(ids(res.body.matches)).toEqual(expected);
  });

  test('an empty page caused by filters gets no hints (there are matches without them)', async () => {
    const res = await matches('?genderComposition=ALL_MALE');
    expect(res.body.matches.total).toBe(0);
    expect(res.body.emptyStateHints).toEqual([]);
  });

  test('viewerRequestStatus shows the latest request for each group', async () => {
    await JoinRequest.create({
      requestId: 'JR-5001',
      groupId: 'G-01',
      seekerId: priya,
      searchId,
      matchSnapshot: {
        sharedNights: 5,
        sharedInterests: ['TEMPLES', 'STREET_FOOD'],
        budgetDiffInr: 2000,
        score: 63,
      },
    });
    const res = await matches();
    const status = Object.fromEntries(res.body.matches.items.map((m) => [m.groupId, m.viewerRequestStatus]));
    expect(status).toEqual({ 'G-01': 'PENDING', 'G-08': null });
  });

  test.each([
    ['?sharedInterest=SKYDIVING', 'sharedInterest.0'],
    ['?genderComposition=WOMEN', 'genderComposition'],
    ['?limit=60', 'limit'],
  ])('400 for %s', async (qs, field) => {
    const res = await matches(qs);
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.field)).toContain(field);
  });

  test('403 for another traveller, 404 for an unknown search, 401 without identity', async () => {
    expect((await matches('', 'T-001')).status).toBe(403);
    expect((await t.get('/api/v1/searches/S-9999/matches', priya)).status).toBe(404);
    expect((await matches('', null)).status).toBe(401);
  });
});

describe('E14 GET /searches/:searchId/groups/:groupId/evaluation', () => {
  let searchId;
  const evaluation = (groupId, as = priya) =>
    t.get(`/api/v1/searches/${searchId}/groups/${groupId}/evaluation`, as);

  beforeAll(async () => {
    await t.reset();
    await signUpPriya();
    searchId = (await search(PRIYA_SEARCH)).body.search.searchId;
  });

  test('G-04 Kyoto Ryokan Retreat: exactly the API spec example', async () => {
    const res = await evaluation('G-04');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
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

  test.each([
    ['G-01', true, []],
    ['G-03', false, ['SAME_CITY']], // other city: still evaluated
    ['G-06', false, ['GENDER']],
    ['G-07', false, ['GROUP_SIZE']], // FULL: still evaluated
  ])('%s → eligible %p, failed %p', async (groupId, eligible, failed) => {
    const res = await evaluation(groupId);
    expect(res.body).toMatchObject({ eligible, failed });
    expect(res.body.checks).toHaveLength(6);
  });

  test('404 for an unknown group or search, 403 for another traveller, 401 without identity', async () => {
    expect((await evaluation('G-999')).status).toBe(404);
    expect((await t.get('/api/v1/searches/S-9999/groups/G-01/evaluation', priya)).status).toBe(404);
    expect((await evaluation('G-01', 'T-001')).status).toBe(403);
    expect((await evaluation('G-01', null)).status).toBe(401);
  });
});
