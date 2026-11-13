const { useTestApp } = require('../helpers/testApp');
const { Group, JoinRequest } = require('../../src/models');

jest.setTimeout(30000);
const t = useTestApp('join_requests');

const SARAH = 'T-001';
const FEMALE_SEEKER = Object.freeze({
  age: 26,
  gender: 'FEMALE',
  homeCity: 'Mumbai',
  interests: ['TEMPLES', 'STREET_FOOD', 'ADVENTURE'],
  genderPreference: 'SAME_GENDER',
});
const KYOTO_SEARCH = Object.freeze({
  homeCity: 'Mumbai',
  city: 'Kyoto',
  checkIn: '2027-04-09',
  checkOut: '2027-04-16',
  interests: ['TEMPLES', 'STREET_FOOD', 'ADVENTURE'],
  budgetInr: 62000,
  genderPreference: 'SAME_GENDER',
});

// A fresh female seeker with her own Kyoto search → { id, searchId }
async function newSeeker(name) {
  const id = (await t.post('/api/v1/travellers', { ...FEMALE_SEEKER, name })).body.traveller.travellerId;
  const searchId = (await t.post('/api/v1/searches', KYOTO_SEARCH, id)).body.search.searchId;
  return { id, searchId };
}
const searchAs = async (travellerId, body = KYOTO_SEARCH) =>
  (await t.post('/api/v1/searches', body, travellerId)).body.search.searchId;

const interested = (groupId, seeker, message) =>
  t.post(`/api/v1/groups/${groupId}/join-requests`, { searchId: seeker.searchId, message }, seeker.id);
const approve = (requestId, as = SARAH) =>
  t.post(`/api/v1/join-requests/${requestId}/approve`, undefined, as);
const reject = (requestId, as = SARAH) => t.post(`/api/v1/join-requests/${requestId}/reject`, undefined, as);
const withdraw = (requestId, as) => t.post(`/api/v1/join-requests/${requestId}/withdraw`, undefined, as);
const groupAs = async (groupId, as) => (await t.get(`/api/v1/groups/${groupId}`, as)).body.group;

// Sarah's extra Kyoto group with exactly ONE free place (maxSize 2)
const oneSpotGroup = async () =>
  (
    await t.post(
      '/api/v1/groups',
      {
        name: 'Kyoto Duo',
        city: 'Kyoto',
        checkIn: '2027-04-10',
        checkOut: '2027-04-15',
        maxSize: 2,
        budgetInr: 60000,
      },
      SARAH,
    )
  ).body.group.groupId;

describe('E15 POST /groups/:groupId/join-requests ("Interested")', () => {
  let priya;
  beforeAll(async () => {
    await t.reset();
    priya = await newSeeker('Priya Nair');
  });

  test('201 PENDING with the match snapshot; the group shows PENDING to the seeker', async () => {
    const res = await interested('G-01', priya, 'Hi Sarah! I love temples and street food too.');
    expect(res.status).toBe(201);
    expect(res.body.request).toEqual({
      requestId: 'JR-1001',
      groupId: 'G-01',
      seekerId: priya.id,
      searchId: priya.searchId,
      status: 'PENDING',
      message: 'Hi Sarah! I love temples and street food too.',
      matchSnapshot: {
        sharedNights: 5,
        sharedInterests: ['TEMPLES', 'STREET_FOOD'],
        budgetDiffInr: 2000,
        score: 63,
      },
      createdAt: expect.stringMatching(/Z$/),
      decidedAt: null,
      decidedBy: null,
    });
    expect(res.body.group.viewer).toEqual({
      relation: 'PENDING',
      requestId: 'JR-1001',
      pendingRequestCount: null,
    });
  });

  test('the owner gets the badge (E09 count, E10 total)', async () => {
    expect((await groupAs('G-01', SARAH)).viewer.pendingRequestCount).toBe(1);
    expect((await t.get('/api/v1/me/groups', SARAH)).body.totalPendingRequests).toBe(1);
  });

  test('the match card now says PENDING', async () => {
    const res = await t.get(`/api/v1/searches/${priya.searchId}/matches`, priya.id);
    expect(res.body.matches.items.find((m) => m.groupId === 'G-01').viewerRequestStatus).toBe('PENDING');
  });

  test('409 DUPLICATE_REQUEST for a second pending request', async () => {
    const res = await interested('G-01', priya);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_REQUEST');
  });

  test('a double-click (two requests at once) creates exactly one', async () => {
    const anika = await newSeeker('Anika');
    const [a, b] = await Promise.all([interested('G-08', anika), interested('G-08', anika)]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await JoinRequest.countDocuments({ groupId: 'G-08', seekerId: anika.id, status: 'PENDING' })).toBe(
      1,
    );
  });

  test('message is optional; an empty one is stored as null', async () => {
    const meera = await newSeeker('Meera');
    const res = await interested('G-08', meera, '');
    expect(res.status).toBe(201);
    expect(res.body.request.message).toBeNull();
  });

  test('422 NOT_ELIGIBLE for a forged request to G-06 (male owner), with the failing rule', async () => {
    const res = await interested('G-06', priya);
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({
      code: 'NOT_ELIGIBLE',
      message: "You don't match this group.",
      details: [{ rule: 'GENDER', issue: 'The group owner is male and your preference is female only' }],
    });
  });

  test('422 NOT_ELIGIBLE lists every failing rule, in rule order (G-11, Abu Dhabi)', async () => {
    // G-11: Abu Dhabi, 13→17 Apr (3 shared nights: fine), male owner, no shared interests
    const res = await interested('G-11', priya);
    expect(res.status).toBe(422);
    expect(res.body.error.details.map((d) => d.rule)).toEqual(['SAME_CITY', 'SHARED_INTERESTS', 'GENDER']);
  });

  test('409 OWN_GROUP when the owner asks to join her own group', async () => {
    const sarahSearch = await searchAs(SARAH, {
      ...KYOTO_SEARCH,
      homeCity: 'Bengaluru',
      interests: ['TEMPLES', 'STREET_FOOD'],
    });
    const res = await t.post('/api/v1/groups/G-01/join-requests', { searchId: sarahSearch }, SARAH);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('OWN_GROUP');
  });

  test('409 ALREADY_MEMBER for a member', async () => {
    const g05 = t.pack.groups.find((g) => g.groupId === 'G-05');
    const member = g05.memberIds.find((id) => id !== g05.ownerId);
    const memberSearch = await searchAs(member, { ...KYOTO_SEARCH, homeCity: 'Delhi' });
    const res = await t.post('/api/v1/groups/G-05/join-requests', { searchId: memberSearch }, member);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_MEMBER');
  });

  test('409 GROUP_FULL for G-07 (checked before the rules)', async () => {
    const res = await interested('G-07', priya);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('GROUP_FULL');
  });

  test('409 GROUP_CLOSED for a BOOKED group', async () => {
    await Group.updateOne({ groupId: 'G-02' }, { $set: { status: 'BOOKED' } });
    const res = await interested('G-02', priya);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('GROUP_CLOSED');
    await Group.updateOne({ groupId: 'G-02' }, { $set: { status: 'OPEN' } });
  });

  test('403 for a search that belongs to someone else, 404 for an unknown one', async () => {
    const other = await newSeeker('Other');
    const forged = await t.post('/api/v1/groups/G-01/join-requests', { searchId: other.searchId }, priya.id);
    expect(forged.status).toBe(403);
    const unknown = await t.post('/api/v1/groups/G-01/join-requests', { searchId: 'S-9999' }, priya.id);
    expect(unknown.status).toBe(404);
  });

  test('404 for an unknown group (checked first)', async () => {
    const res = await t.post('/api/v1/groups/G-999/join-requests', { searchId: 'S-9999' }, priya.id);
    expect(res.status).toBe(404);
    expect(res.body.error.message).toMatch(/group/);
  });

  test.each([
    ['missing searchId', {}],
    ['message over 500 characters', { searchId: 'S-1001', message: 'x'.repeat(501) }],
    ['unknown field', { searchId: 'S-1001', score: 100 }],
  ])('400 VALIDATION_ERROR: %s', async (_name, body) => {
    const res = await t.post('/api/v1/groups/G-01/join-requests', body, priya.id);
    expect(res.status).toBe(400);
  });

  test('401 without the identity header', async () => {
    expect((await t.post('/api/v1/groups/G-01/join-requests', { searchId: 'S-1001' })).status).toBe(401);
  });
});

describe('E16 GET /groups/:groupId/join-requests (owner inbox)', () => {
  let priya;
  let anika;
  let first;
  let second;
  beforeAll(async () => {
    await t.reset();
    priya = await newSeeker('Priya Nair');
    anika = await newSeeker('Anika');
    first = (await interested('G-01', priya, 'Hi!')).body.request.requestId;
    second = (await interested('G-01', anika)).body.request.requestId;
  });
  const inbox = (qs = '', as = SARAH) => t.get(`/api/v1/groups/G-01/join-requests${qs}`, as);

  test('PENDING by default, oldest first, with the full seeker profile', async () => {
    const res = await inbox();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, limit: 20, total: 2 });
    expect(res.body.items.map((i) => i.request.requestId)).toEqual([first, second]);
    expect(res.body.items[0].seeker).toEqual({
      travellerId: priya.id,
      name: 'Priya Nair',
      age: 26,
      gender: 'FEMALE',
      homeCity: 'Mumbai',
      homeAirport: 'BOM',
      interests: ['TEMPLES', 'STREET_FOOD', 'ADVENTURE'],
      genderPreference: 'SAME_GENDER',
      createdAt: expect.any(String),
      rating: { average: null, count: 0 },
    });
  });

  test('status filter and ALL for history', async () => {
    await reject(second);
    expect((await inbox()).body.items.map((i) => i.request.requestId)).toEqual([first]);
    expect((await inbox('?status=REJECTED')).body.items.map((i) => i.request.requestId)).toEqual([second]);
    expect((await inbox('?status=ALL')).body.total).toBe(2);
  });

  test('403 for anyone but the owner (even the seeker)', async () => {
    expect((await inbox('', priya.id)).status).toBe(403);
  });

  test('400 for an unknown status, 404 for an unknown group', async () => {
    expect((await inbox('?status=OPEN')).status).toBe(400);
    expect((await t.get('/api/v1/groups/G-999/join-requests', SARAH)).status).toBe(404);
  });
});

describe('E17 GET /me/join-requests', () => {
  let priya;
  beforeAll(async () => {
    await t.reset();
    priya = await newSeeker('Priya Nair');
    await interested('G-01', priya);
    const second = (await interested('G-08', priya)).body.request.requestId;
    await withdraw(second, priya.id);
  });

  test('every status by default, newest first, with a group summary', async () => {
    const res = await t.get('/api/v1/me/join-requests', priya.id);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items.map((i) => [i.request.groupId, i.request.status])).toEqual([
      ['G-08', 'WITHDRAWN'],
      ['G-01', 'PENDING'],
    ]);
    expect(res.body.items[1].group).toEqual({
      groupId: 'G-01',
      name: 'Kyoto Spring Temples',
      city: 'Kyoto',
      checkIn: '2027-04-10',
      checkOut: '2027-04-15',
      owner: { name: 'Sarah Thomas' },
    });
  });

  test('status filter', async () => {
    const res = await t.get('/api/v1/me/join-requests?status=PENDING', priya.id);
    expect(res.body.items.map((i) => i.request.groupId)).toEqual(['G-01']);
  });

  test('another traveller sees only their own (none)', async () => {
    expect((await t.get('/api/v1/me/join-requests', SARAH)).body.total).toBe(0);
  });

  test('400 for a bad status, 401 without identity', async () => {
    expect((await t.get('/api/v1/me/join-requests?status=NOPE', priya.id)).status).toBe(400);
    expect((await t.get('/api/v1/me/join-requests')).status).toBe(401);
  });
});

describe('E18 POST /join-requests/:requestId/approve', () => {
  beforeEach(() => t.reset());

  test('APPROVED: the seeker becomes a member, sees MEMBER and the group under memberOf', async () => {
    const priya = await newSeeker('Priya Nair');
    const requestId = (await interested('G-01', priya)).body.request.requestId;

    const res = await approve(requestId);
    expect(res.status).toBe(200);
    expect(res.body.request).toMatchObject({
      requestId,
      status: 'APPROVED',
      decidedBy: SARAH,
      decidedAt: expect.stringMatching(/Z$/),
    });
    expect(res.body.group).toMatchObject({ groupId: 'G-01', memberCount: 2, freeSpots: 1, status: 'OPEN' });
    expect(res.body.group.members.map((m) => [m.travellerId, m.isOwner])).toEqual([
      [SARAH, true],
      [priya.id, false],
    ]);
    expect(res.body.closedRequestIds).toEqual([]);

    expect((await groupAs('G-01', priya.id)).viewer.relation).toBe('MEMBER');
    expect((await t.get('/api/v1/me/groups', priya.id)).body.memberOf.map((g) => g.groupId)).toEqual([
      'G-01',
    ]);
    // G-01 no longer shows up in her matches, and neither does G-08 (10–14 Apr overlaps her trip)
    const matches = await t.get(`/api/v1/searches/${priya.searchId}/matches`, priya.id);
    expect(matches.body.matches.items.map((m) => m.groupId)).toEqual([]);
  });

  test('taking the last place makes the group FULL and closes the other pending requests', async () => {
    const duo = await oneSpotGroup();
    const priya = await newSeeker('Priya Nair');
    const anika = await newSeeker('Anika');
    const meera = await newSeeker('Meera');
    const p = (await interested(duo, priya)).body.request.requestId;
    const a = (await interested(duo, anika)).body.request.requestId;
    const m = (await interested(duo, meera)).body.request.requestId;

    const res = await approve(p);
    expect(res.status).toBe(200);
    expect(res.body.group).toMatchObject({ status: 'FULL', memberCount: 2, freeSpots: 0 });
    expect(res.body.closedRequestIds).toEqual([a, m]);
    expect((await JoinRequest.findOne({ requestId: a }).lean()).status).toBe('CLOSED');

    // approving a closed request says why: the group is full
    const late = await approve(a);
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('GROUP_FULL');
  });

  test('two approvals in parallel for the last place: exactly one wins, the group is never overfilled', async () => {
    const duo = await oneSpotGroup();
    const priya = await newSeeker('Priya Nair');
    const anika = await newSeeker('Anika');
    const p = (await interested(duo, priya)).body.request.requestId;
    const a = (await interested(duo, anika)).body.request.requestId;

    const results = await Promise.all([approve(p), approve(a)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409).body.error.code).toBe('GROUP_FULL');

    const group = await Group.findOne({ groupId: duo }).lean();
    expect(group.memberIds).toHaveLength(2);
    expect(group.status).toBe('FULL');
    const statuses = (await JoinRequest.find({ requestId: { $in: [p, a] } }).lean())
      .map((r) => r.status)
      .sort();
    expect(statuses).toEqual(['APPROVED', 'CLOSED']);
  });

  test('409 GROUP_CLOSED when the group has booked', async () => {
    const priya = await newSeeker('Priya Nair');
    const requestId = (await interested('G-01', priya)).body.request.requestId;
    await Group.updateOne({ groupId: 'G-01' }, { $set: { status: 'BOOKED' } });
    const res = await approve(requestId);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('GROUP_CLOSED');
  });

  test('409 REQUEST_NOT_PENDING for an already decided request', async () => {
    const priya = await newSeeker('Priya Nair');
    const requestId = (await interested('G-01', priya)).body.request.requestId;
    await reject(requestId);
    const res = await approve(requestId);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('REQUEST_NOT_PENDING');
  });

  test('403 for anyone but the owner (the seeker cannot approve herself)', async () => {
    const priya = await newSeeker('Priya Nair');
    const requestId = (await interested('G-01', priya)).body.request.requestId;
    const res = await approve(requestId, priya.id);
    expect(res.status).toBe(403);
    expect((await JoinRequest.findOne({ requestId }).lean()).status).toBe('PENDING');
  });

  test.each(['JR-9999', 'JR-x'])('404 for unknown or malformed %s', async (id) => {
    expect((await approve(id)).status).toBe(404);
  });
});

describe('E19 reject / E20 withdraw', () => {
  let priya;
  beforeAll(async () => {
    await t.reset();
    priya = await newSeeker('Priya Nair');
  });

  test('reject → REJECTED; the seeker sees REJECTED and may request again (new id)', async () => {
    const requestId = (await interested('G-01', priya)).body.request.requestId;
    const res = await reject(requestId);
    expect(res.status).toBe(200);
    expect(res.body.request).toMatchObject({ requestId, status: 'REJECTED', decidedBy: SARAH });
    expect((await groupAs('G-01', priya.id)).viewer).toEqual({
      relation: 'REJECTED',
      requestId,
      pendingRequestCount: null,
    });

    const again = await interested('G-01', priya);
    expect(again.status).toBe(201);
    expect(again.body.request.requestId).not.toBe(requestId);
  });

  test('withdraw → WITHDRAWN, decided by the seeker; the group shows NONE', async () => {
    const pending = (
      await JoinRequest.findOne({ groupId: 'G-01', seekerId: priya.id, status: 'PENDING' }).lean()
    ).requestId;
    const res = await withdraw(pending, priya.id);
    expect(res.status).toBe(200);
    expect(res.body.request).toMatchObject({ requestId: pending, status: 'WITHDRAWN', decidedBy: priya.id });
    expect((await groupAs('G-01', priya.id)).viewer.relation).toBe('NONE');
    expect((await groupAs('G-01', SARAH)).viewer.pendingRequestCount).toBe(0);
  });

  test('409 REQUEST_NOT_PENDING when it is already decided', async () => {
    const requestId = (await interested('G-08', priya)).body.request.requestId;
    await withdraw(requestId, priya.id);
    expect((await withdraw(requestId, priya.id)).body.error.code).toBe('REQUEST_NOT_PENDING');
    expect((await reject(requestId, t.pack.groups.find((g) => g.groupId === 'G-08').ownerId)).status).toBe(
      409,
    );
  });

  test('403: only the owner rejects, only the seeker withdraws', async () => {
    const id = (await interested('G-01', priya)).body.request.requestId;
    expect((await reject(id, priya.id)).status).toBe(403);
    expect((await withdraw(id, SARAH)).status).toBe(403);
    expect((await JoinRequest.findOne({ requestId: id }).lean()).status).toBe('PENDING');
  });

  test('404 for an unknown request', async () => {
    expect((await reject('JR-9999')).status).toBe(404);
    expect((await withdraw('JR-9999', priya.id)).status).toBe(404);
  });
});

describe('one group per night: 409 DATES_CONFLICT', () => {
  // G-01 (Sarah) 10→15 Apr and G-08 10→14 Apr overlap; both match Priya's search
  const G08_OWNER = () => t.pack.groups.find((g) => g.groupId === 'G-08').ownerId;
  let priya;
  beforeEach(async () => {
    await t.reset();
    priya = await newSeeker('Priya Nair');
  });

  // Sarah's back-to-back Kyoto trip 15→18 Apr (G-01 checks out on 15 Apr) and a search that fits it
  async function backToBack() {
    const groupId = (
      await t.post(
        '/api/v1/groups',
        {
          name: 'Kyoto Encore',
          city: 'Kyoto',
          checkIn: '2027-04-15',
          checkOut: '2027-04-18',
          maxSize: 3,
          budgetInr: 60000,
        },
        SARAH,
      )
    ).body.group.groupId;
    const searchId = await searchAs(priya.id, {
      ...KYOTO_SEARCH,
      checkIn: '2027-04-15',
      checkOut: '2027-04-20',
    });
    return { groupId, seeker: { id: priya.id, searchId } };
  }

  test('approval closes the seeker’s other pending requests that overlap, but not back-to-back ones', async () => {
    const encore = await backToBack();
    const r01 = (await interested('G-01', priya)).body.request.requestId;
    const r08 = (await interested('G-08', priya)).body.request.requestId;
    const rEncore = (await interested(encore.groupId, encore.seeker)).body.request.requestId;

    const res = await approve(r01);
    expect(res.status).toBe(200);
    expect(res.body.closedRequestIds).toEqual([]);
    expect(res.body.closedSeekerRequestIds).toEqual([r08]);

    const status = async (id) => (await JoinRequest.findOne({ requestId: id }).lean()).status;
    expect(await status(r08)).toBe('CLOSED');
    expect(await status(rEncore)).toBe('PENDING');
    // G-08's owner no longer sees it; approving it anyway explains why
    expect((await groupAs('G-08', G08_OWNER())).viewer.pendingRequestCount).toBe(0);
    const late = await approve(r08, G08_OWNER());
    expect(late.status).toBe(409);
    expect(late.body.error).toMatchObject({
      code: 'DATES_CONFLICT',
      details: [{ groupId: 'G-01', issue: 'Already in Kyoto Spring Temples (Kyoto, 10–15 Apr)' }],
    });

    // back-to-back trips are fine: 10→15 then 15→18
    expect((await approve(rEncore)).status).toBe(200);
    expect((await t.get('/api/v1/me/groups', priya.id)).body.memberOf.map((g) => g.groupId)).toEqual([
      'G-01',
      encore.groupId,
    ]);
  });

  test('E15 refuses "Interested" for a group that overlaps a trip already joined', async () => {
    await approve((await interested('G-01', priya)).body.request.requestId);
    const res = await interested('G-08', priya);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DATES_CONFLICT');
    expect(res.body.error.details[0].groupId).toBe('G-01');
    expect(await JoinRequest.countDocuments({ groupId: 'G-08', seekerId: priya.id })).toBe(0);
  });

  test('overlapping groups disappear from the seeker’s matches once she has joined one', async () => {
    const before = await t.get(`/api/v1/searches/${priya.searchId}/matches`, priya.id);
    expect(before.body.matches.items.map((m) => m.groupId)).toEqual(['G-01', 'G-08']);
    await approve((await interested('G-01', priya)).body.request.requestId);
    const after = await t.get(`/api/v1/searches/${priya.searchId}/matches`, priya.id);
    expect(after.body.matches.total).toBe(0);
  });

  test('two owners approving the same seeker at the same moment: exactly one wins', async () => {
    const r01 = (await interested('G-01', priya)).body.request.requestId;
    const r08 = (await interested('G-08', priya)).body.request.requestId;

    const results = await Promise.all([approve(r01, SARAH), approve(r08, G08_OWNER())]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409).body.error.code).toBe('DATES_CONFLICT');

    const groupsWithPriya = await Group.find({ memberIds: priya.id }).lean();
    expect(groupsWithPriya).toHaveLength(1);
    const statuses = (await JoinRequest.find({ requestId: { $in: [r01, r08] } }).lean()).map((r) => r.status);
    expect(statuses.sort()).toEqual(['APPROVED', 'CLOSED']);
  });

  test('different seekers are approved in parallel without waiting on each other', async () => {
    const anika = await newSeeker('Anika');
    const p = (await interested('G-01', priya)).body.request.requestId;
    const a = (await interested('G-08', anika)).body.request.requestId;
    const results = await Promise.all([approve(p, SARAH), approve(a, G08_OWNER())]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
  });
});
