const { useTestApp } = require('../helpers/testApp');
const { JoinRequest } = require('../../src/models');

jest.setTimeout(30000);
const t = useTestApp('groups');

const SARAH = 'T-001';
const PRIYA = 'T-002';
const SARAH_POST = Object.freeze({
  name: 'Kyoto Spring Temples',
  city: 'Kyoto',
  checkIn: '2027-04-10',
  checkOut: '2027-04-15',
  maxSize: 3,
  budgetInr: 60000,
  itinerary: 'Fushimi Inari at sunrise, Nishiki Market lunch, Gion walk.',
});
const create = (body, as = SARAH) => t.post('/api/v1/groups', body, as);
const seedGroup = (id) => t.pack.groups.find((g) => g.groupId === id);
const otherMemberOf = (id) => {
  const g = seedGroup(id);
  return g.memberIds.find((m) => m !== g.ownerId);
};

// Join requests are created through the API in phase 7; here we insert them directly
let requestSeq = 5000;
const insertRequest = (groupId, seekerId, status, createdAt = new Date()) =>
  JoinRequest.create({
    requestId: `JR-${(requestSeq += 1)}`,
    groupId,
    seekerId,
    searchId: 'S-1001',
    status,
    matchSnapshot: {
      sharedNights: 5,
      sharedInterests: ['TEMPLES', 'STREET_FOOD'],
      budgetDiffInr: 2000,
      score: 63,
    },
    createdAt,
  });

describe('E08 POST /groups', () => {
  beforeAll(() => t.reset());

  test('201: the actor becomes the owner and first member', async () => {
    const res = await create(SARAH_POST);
    expect(res.status).toBe(201);
    expect(res.body.group).toEqual({
      groupId: 'G-1001',
      name: 'Kyoto Spring Temples',
      city: 'Kyoto',
      country: 'Japan',
      timezone: 'Asia/Tokyo',
      checkIn: '2027-04-10',
      checkOut: '2027-04-15',
      nights: 5,
      maxSize: 3,
      memberCount: 1,
      freeSpots: 2,
      budgetInr: 60000,
      itinerary: SARAH_POST.itinerary,
      status: 'OPEN',
      owner: { travellerId: SARAH, name: 'Sarah Thomas', gender: 'FEMALE' },
      members: [
        { travellerId: SARAH, name: 'Sarah Thomas', gender: 'FEMALE', homeCity: 'Bengaluru', isOwner: true },
      ],
      viewer: { relation: 'OWNER', requestId: null, pendingRequestCount: 0 },
      createdAt: expect.stringMatching(/Z$/),
    });
  });

  test('it persists: GET /groups/:id returns the same group', async () => {
    const created = (await create(SARAH_POST)).body.group;
    const res = await t.get(`/api/v1/groups/${created.groupId}`, SARAH);
    expect(res.status).toBe(200);
    expect(res.body.group).toEqual(created);
  });

  test('maxSize 1 is FULL from the start; itinerary defaults to ""', async () => {
    const { itinerary: _i, ...noItinerary } = SARAH_POST;
    const res = await create({ ...noItinerary, maxSize: 1 });
    expect(res.status).toBe(201);
    expect(res.body.group).toMatchObject({ status: 'FULL', freeSpots: 0, itinerary: '' });
  });

  test('the whole data window is accepted (1 → 20 Apr) in every city', async () => {
    for (const city of ['Tokyo', 'Kyoto', 'Osaka', 'Dubai', 'Abu Dhabi']) {
      const res = await create({ ...SARAH_POST, city, checkIn: '2027-04-01', checkOut: '2027-04-20' });
      expect(res.status).toBe(201);
      expect(res.body.group).toMatchObject({ city, nights: 19 });
    }
    const dubai = await create({ ...SARAH_POST, city: 'Dubai' });
    expect(dubai.body.group).toMatchObject({ country: 'United Arab Emirates', timezone: 'Asia/Dubai' });
  });

  test.each([
    ['name too short', { name: 'Ky' }, 'name'],
    ['name too long', { name: 'x'.repeat(81) }, 'name'],
    ['maxSize 0', { maxSize: 0 }, 'maxSize'],
    ['maxSize 5', { maxSize: 5 }, 'maxSize'],
    ['maxSize not whole', { maxSize: 2.5 }, 'maxSize'],
    ['budget below 1,000', { budgetInr: 999 }, 'budgetInr'],
    ['budget above 10,000,000', { budgetInr: 10000001 }, 'budgetInr'],
    ['budget as text', { budgetInr: '60000' }, 'budgetInr'],
    ['itinerary too long', { itinerary: 'x'.repeat(2001) }, 'itinerary'],
    ['impossible date 31 Apr', { checkOut: '2027-04-31' }, 'checkOut'],
    ['wrong date format', { checkIn: '10-04-2027' }, 'checkIn'],
    ['check-out same as check-in', { checkOut: '2027-04-10' }, 'checkOut'],
    ['check-out before check-in', { checkOut: '2027-04-09' }, 'checkOut'],
    ['the owner cannot be chosen', { ownerId: 'T-005' }, 'ownerId'],
    ['members cannot be chosen', { memberIds: ['T-001', 'T-002'] }, 'memberIds'],
  ])('400 VALIDATION_ERROR: %s', async (_name, change, field) => {
    const res = await create({ ...SARAH_POST, ...change });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d) => d.field)).toContain(field);
  });

  test('400 for a missing required field', async () => {
    const { city: _c, ...noCity } = SARAH_POST;
    const res = await create(noCity);
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([{ field: 'city', issue: 'Required' }]);
  });

  test('the check-out error matches the spec example', async () => {
    const res = await create({ ...SARAH_POST, checkOut: '2027-04-10' });
    expect(res.body.error.details).toEqual([{ field: 'checkOut', issue: 'must be after checkIn' }]);
  });

  test('422 OUT_OF_DATA_RANGE for a city outside the data, naming the allowed values', async () => {
    const res = await create({ ...SARAH_POST, city: 'Bangkok' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({
      code: 'OUT_OF_DATA_RANGE',
      message: 'We only have data for Tokyo, Kyoto, Osaka, Dubai and Abu Dhabi between 1 and 20 April 2027.',
      details: [{ field: 'city', issue: "'Bangkok' is not available" }],
    });
  });

  test.each([
    ['lower-case city (cities are case-sensitive)', { city: 'kyoto' }, ['city']],
    ['check-in before 1 Apr', { checkIn: '2027-03-30' }, ['checkIn']],
    ['check-out after 20 Apr', { checkOut: '2027-04-21' }, ['checkOut']],
    ['another year', { checkIn: '2026-04-10', checkOut: '2026-04-15' }, ['checkIn']],
    ['both city and dates', { city: 'Paris', checkOut: '2027-05-01' }, ['city', 'checkOut']],
  ])('422 OUT_OF_DATA_RANGE: %s', async (_name, change, fields) => {
    const res = await create({ ...SARAH_POST, ...change });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('OUT_OF_DATA_RANGE');
    expect(res.body.error.details.map((d) => d.field)).toEqual(fields);
  });

  test('400 checks win over 422 checks (city outside the data and check-out before check-in)', async () => {
    const res = await create({ ...SARAH_POST, city: 'Bangkok', checkOut: '2027-04-09' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('a rejected post does not use up a group id', async () => {
    await create({ ...SARAH_POST, city: 'Bangkok' });
    const before = await create(SARAH_POST);
    const after = await create(SARAH_POST);
    expect(Number(after.body.group.groupId.slice(2))).toBe(Number(before.body.group.groupId.slice(2)) + 1);
  });

  test('401 without the identity header (even with a bad body)', async () => {
    const res = await create({}, null);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});

describe('E09 GET /groups/:groupId', () => {
  beforeAll(() => t.reset());
  const view = (id, as) => t.get(`/api/v1/groups/${id}`, as);

  test('the owner sees OWNER with the pending count', async () => {
    const res = await view('G-01', SARAH);
    expect(res.status).toBe(200);
    expect(res.body.group).toMatchObject({
      groupId: 'G-01',
      name: 'Kyoto Spring Temples',
      nights: 5,
      memberCount: 1,
      freeSpots: 2,
      status: 'OPEN',
      viewer: { relation: 'OWNER', requestId: null, pendingRequestCount: 0 },
    });
  });

  test('a stranger sees NONE, and no pending count', async () => {
    const res = await view('G-01', PRIYA);
    expect(res.body.group.viewer).toEqual({ relation: 'NONE', requestId: null, pendingRequestCount: null });
  });

  test('a non-owner member sees MEMBER', async () => {
    const member = otherMemberOf('G-05');
    const res = await view('G-05', member);
    expect(res.body.group.viewer).toEqual({ relation: 'MEMBER', requestId: null, pendingRequestCount: null });
  });

  test('members are listed owner first, then in join order; FULL groups say so', async () => {
    const g07 = seedGroup('G-07');
    const res = await view('G-07', PRIYA);
    expect(res.body.group).toMatchObject({ status: 'FULL', memberCount: 3, maxSize: 3, freeSpots: 0 });
    expect(res.body.group.members.map((m) => m.travellerId)).toEqual(g07.memberIds);
    expect(res.body.group.members[0]).toMatchObject({ travellerId: g07.ownerId, isOwner: true });
    expect(res.body.group.members.slice(1).every((m) => m.isOwner === false)).toBe(true);
  });

  describe('viewer relation from the latest join request', () => {
    beforeAll(() => t.reset());

    test('PENDING (with the request id), and the owner count goes up', async () => {
      const req = await insertRequest('G-01', PRIYA, 'PENDING');
      const asSeeker = await view('G-01', PRIYA);
      expect(asSeeker.body.group.viewer).toEqual({
        relation: 'PENDING',
        requestId: req.requestId,
        pendingRequestCount: null,
      });
      const asOwner = await view('G-01', SARAH);
      expect(asOwner.body.group.viewer.pendingRequestCount).toBe(1);
    });

    test('REJECTED when the latest request was rejected', async () => {
      const req = await insertRequest('G-08', PRIYA, 'REJECTED');
      const res = await view('G-08', PRIYA);
      expect(res.body.group.viewer).toEqual({
        relation: 'REJECTED',
        requestId: req.requestId,
        pendingRequestCount: null,
      });
    });

    test('NONE when a newer request was withdrawn (only the latest counts)', async () => {
      await insertRequest('G-02', PRIYA, 'REJECTED', new Date('2026-11-13T09:00:00Z'));
      await insertRequest('G-02', PRIYA, 'WITHDRAWN', new Date('2026-11-13T10:00:00Z'));
      const res = await view('G-02', PRIYA);
      expect(res.body.group.viewer.relation).toBe('NONE');
    });

    test('CLOSED requests show NONE', async () => {
      await insertRequest('G-04', PRIYA, 'CLOSED');
      expect((await view('G-04', PRIYA)).body.group.viewer.relation).toBe('NONE');
    });
  });

  test.each(['G-999', 'G-abc'])('404 for unknown or malformed %s', async (id) => {
    const res = await view(id, SARAH);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  test('401 without the identity header', async () => {
    expect((await view('G-01')).status).toBe(401);
  });
});

describe('E10 GET /me/groups', () => {
  beforeEach(() => t.reset());
  const mine = (as) => t.get('/api/v1/me/groups', as);

  test('Sarah owns G-01, is in nothing else, no pending requests', async () => {
    const res = await mine(SARAH);
    expect(res.status).toBe(200);
    expect(res.body.owned.map((g) => g.groupId)).toEqual(['G-01']);
    expect(res.body.memberOf).toEqual([]);
    expect(res.body.totalPendingRequests).toBe(0);
    expect(res.body.owned[0].viewer).toEqual({ relation: 'OWNER', requestId: null, pendingRequestCount: 0 });
  });

  test('a non-owner member sees the group under memberOf', async () => {
    const member = otherMemberOf('G-05');
    const res = await mine(member);
    expect(res.body.memberOf.map((g) => g.groupId)).toContain('G-05');
    expect(res.body.owned.every((g) => g.viewer.relation === 'OWNER')).toBe(true);
    expect(res.body.memberOf.every((g) => g.viewer.relation === 'MEMBER')).toBe(true);
  });

  test('the badge total sums PENDING requests across owned groups only', async () => {
    const second = (await create({ ...SARAH_POST, name: 'Osaka Weekend', city: 'Osaka' })).body.group;
    await insertRequest('G-01', PRIYA, 'PENDING');
    await insertRequest('G-01', 'T-003', 'PENDING');
    await insertRequest('G-01', 'T-004', 'REJECTED');
    await insertRequest(second.groupId, PRIYA, 'PENDING');
    await insertRequest('G-08', PRIYA, 'PENDING'); // not Sarah's group

    const res = await mine(SARAH);
    expect(res.body.totalPendingRequests).toBe(3);
    const counts = Object.fromEntries(res.body.owned.map((g) => [g.groupId, g.viewer.pendingRequestCount]));
    expect(counts).toEqual({ 'G-01': 2, [second.groupId]: 1 });
  });

  test('owned groups are sorted by check-in, then group id', async () => {
    const early = (await create({ ...SARAH_POST, checkIn: '2027-04-02', checkOut: '2027-04-05' })).body.group;
    const sameDay = (await create(SARAH_POST)).body.group; // same check-in as G-01
    const res = await mine(SARAH);
    expect(res.body.owned.map((g) => g.groupId)).toEqual([early.groupId, 'G-01', sameDay.groupId]);
  });

  test('a traveller with no groups gets empty lists', async () => {
    const res = await mine(PRIYA);
    expect(res.body).toEqual({ owned: [], memberOf: [], totalPendingRequests: 0 });
  });

  test('401 without the identity header', async () => {
    expect((await mine()).status).toBe(401);
  });
});
