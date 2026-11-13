const { useTestApp } = require('../helpers/testApp');
const { joinGroup } = require('../helpers/scenario');
const { Availability, Group, SavedOption } = require('../../src/models');

jest.setTimeout(30000);
const t = useTestApp('saved_options');

const SARAH = 'T-001';
const TWIN = 'RM-KYO-001-A';
const base = '/api/v1/groups/G-01/saved-options';
const save = (roomId, as = SARAH) => t.post(base, { roomId }, as);
const list = (as = SARAH) => t.get(base, as);
const vote = (optionId, as) => t.post(`${base}/${optionId}/vote`, undefined, as);
const unvote = (optionId, as) => t.del(`${base}/${optionId}/vote`, as);
const remove = (optionId, as) => t.del(`${base}/${optionId}`, as);

// A Kyoto room (other than the Twin) that is available for 2 on 10–14 Apr, from the hotel search
async function anotherAvailableRoom() {
  const res = await t.get('/api/v1/groups/G-01/hotels?limit=50', SARAH);
  return res.body.items.flatMap((h) => h.options).find((o) => o.roomId !== TWIN).roomId;
}

let priya;
beforeEach(async () => {
  await t.reset();
  priya = await joinGroup(t, { groupId: 'G-01', ownerId: SARAH, name: 'Priya Nair' });
});

describe('E22 POST /groups/:groupId/saved-options', () => {
  test('201, priced on the server, with the saver’s vote (the API spec example)', async () => {
    const res = await save(TWIN);
    expect(res.status).toBe(201);
    expect(res.body.option).toEqual({
      optionId: 'OPT-1001',
      groupId: 'G-01',
      hotel: {
        hotelId: 'HTL-KYO-001',
        name: 'Gion Corner Hotel',
        city: 'Kyoto',
        area: 'Gion',
        stars: 3,
        rating: 7.8,
        image: '/static/hotels/HOTEL-BUSINESS-1.jpg',
        checkInFrom: '15:00',
        checkOutUntil: '11:00',
      },
      room: {
        roomId: TWIN,
        roomType: 'TWIN',
        name: 'Twin Room',
        maxAdults: 2,
        pricePerNightInr: 4760,
        refundable: true,
      },
      savedBy: SARAH,
      votes: [SARAH],
      voteCount: 1,
      memberCount: 2,
      allAgree: false,
      snapshot: { memberCount: 2, roomsNeeded: 1, totalInr: 23800, perMemberInr: 11900 },
      live: { roomsNeeded: 1, totalInr: 23800, perMemberInr: 11900, available: true },
      stale: false,
      createdAt: expect.stringMatching(/Z$/),
    });
  });

  test('the hotel search now shows savedOptionId on that room', async () => {
    const optionId = (await save(TWIN)).body.option.optionId;
    const res = await t.get('/api/v1/groups/G-01/hotels?limit=50', priya);
    const twin = res.body.items.flatMap((h) => h.options).find((o) => o.roomId === TWIN);
    expect(twin.savedOptionId).toBe(optionId);
  });

  test('409 ALREADY_SAVED for the same room twice (also by another member)', async () => {
    await save(TWIN);
    const res = await save(TWIN, priya);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_SAVED');
  });

  test('422 ROOMS_UNAVAILABLE naming the first night that fails', async () => {
    await Availability.updateOne({ roomId: TWIN, date: '2027-04-12' }, { $set: { roomsLeft: 0 } });
    const res = await save(TWIN);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ROOMS_UNAVAILABLE');
    expect(res.body.error.details[0]).toEqual({
      date: '2027-04-12',
      roomsLeft: 0,
      roomsNeeded: 1,
      issue: 'Sold out on 12 Apr',
    });
  });

  test('404 for a room in another city or an unknown room', async () => {
    expect((await save('RM-TYO-001-A')).status).toBe(404);
    expect((await save('RM-KYO-999-Z')).status).toBe(404);
  });

  test('400 for a missing or malformed roomId, or a price in the body', async () => {
    expect((await t.post(base, {}, SARAH)).status).toBe(400);
    expect((await save('twin room')).status).toBe(400);
    expect((await t.post(base, { roomId: TWIN, totalInr: 1 }, SARAH)).status).toBe(400);
  });

  test('409 GROUP_CLOSED once booked', async () => {
    await Group.updateOne({ groupId: 'G-01' }, { $set: { status: 'BOOKED' } });
    expect((await save(TWIN)).body.error.code).toBe('GROUP_CLOSED');
  });

  test('403 for a non-member, 404 for an unknown group', async () => {
    expect((await save(TWIN, 'T-005')).status).toBe(403);
    expect((await t.post('/api/v1/groups/G-999/saved-options', { roomId: TWIN }, SARAH)).status).toBe(404);
  });
});

describe('E23 GET /groups/:groupId/saved-options', () => {
  test('both members agree → allAgree (the API spec example)', async () => {
    const optionId = (await save(TWIN)).body.option.optionId;
    await vote(optionId, priya);
    const res = await list(priya);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      optionId,
      votes: [SARAH, priya],
      voteCount: 2,
      memberCount: 2,
      allAgree: true,
      live: { roomsNeeded: 1, totalInr: 23800, perMemberInr: 11900, available: true },
      stale: false,
    });
  });

  test('sorted by votes, then by live per-member price', async () => {
    const twin = (await save(TWIN)).body.option;
    const other = (await save(await anotherAvailableRoom(), priya)).body.option;
    // one vote each → cheaper first
    const first = (await list()).body.items.map((o) => o.optionId);
    const byPrice = [twin, other]
      .sort((a, b) => a.live.perMemberInr - b.live.perMemberInr)
      .map((o) => o.optionId);
    expect(first).toEqual(byPrice);
    // a second vote puts that option on top
    await vote(byPrice[1], byPrice[1] === twin.optionId ? priya : SARAH);
    expect((await list()).body.items[0].optionId).toBe(byPrice[1]);
  });

  test('a new member makes it stale and reprices live (Twin: 2 rooms, ₹47,600, ₹15,866.67 each)', async () => {
    await save(TWIN);
    await joinGroup(t, { groupId: 'G-01', ownerId: SARAH, name: 'Anika' }); // 3 members now
    const [option] = (await list()).body.items;
    expect(option).toMatchObject({
      memberCount: 3,
      allAgree: false,
      snapshot: { memberCount: 2, roomsNeeded: 1, totalInr: 23800, perMemberInr: 11900 },
      live: { roomsNeeded: 2, totalInr: 47600, perMemberInr: 15866.67, available: true },
      stale: true,
    });
  });

  test('sold out since saving → live.available false', async () => {
    await save(TWIN);
    await Availability.updateOne({ roomId: TWIN, date: '2027-04-11' }, { $set: { roomsLeft: 0 } });
    expect((await list()).body.items[0].live.available).toBe(false);
  });

  test('empty list, 403 for a non-member', async () => {
    expect((await list()).body).toEqual({ items: [] });
    expect((await list('T-005')).status).toBe(403);
  });
});

describe('E24 DELETE /groups/:groupId/saved-options/:optionId', () => {
  test('the saver can remove it', async () => {
    const optionId = (await save(TWIN, priya)).body.option.optionId;
    const res = await remove(optionId, priya);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: optionId });
    expect(await SavedOption.countDocuments()).toBe(0);
  });

  test('the owner can remove anyone’s option; another member cannot', async () => {
    const bySarah = (await save(TWIN)).body.option.optionId;
    expect((await remove(bySarah, priya)).status).toBe(403);
    const byPriya = (await save(await anotherAvailableRoom(), priya)).body.option.optionId;
    expect((await remove(byPriya, SARAH)).status).toBe(200);
  });

  test('404 for an unknown option (or one of another group), 409 once booked', async () => {
    expect((await remove('OPT-9999', SARAH)).status).toBe(404);
    const optionId = (await save(TWIN)).body.option.optionId;
    expect(
      (
        await t.del(
          `/api/v1/groups/G-08/saved-options/${optionId}`,
          t.pack.groups.find((g) => g.groupId === 'G-08').ownerId,
        )
      ).status,
    ).toBe(404);
    await Group.updateOne({ groupId: 'G-01' }, { $set: { status: 'BOOKED' } });
    expect((await remove(optionId, SARAH)).body.error.code).toBe('GROUP_CLOSED');
  });
});

describe('E25 / E26 vote', () => {
  test('voting is idempotent both ways', async () => {
    const optionId = (await save(TWIN)).body.option.optionId;
    const once = await vote(optionId, priya);
    const twice = await vote(optionId, priya);
    expect(once.status).toBe(200);
    expect(twice.body.option).toMatchObject({ votes: [SARAH, priya], voteCount: 2, allAgree: true });

    const off = await unvote(optionId, priya);
    const offAgain = await unvote(optionId, priya);
    expect(off.body.option).toMatchObject({ votes: [SARAH], voteCount: 1, allAgree: false });
    expect(offAgain.status).toBe(200);
    expect(offAgain.body.option.voteCount).toBe(1);
  });

  test('the saver can take back her own vote', async () => {
    const optionId = (await save(TWIN)).body.option.optionId;
    expect((await unvote(optionId, SARAH)).body.option.votes).toEqual([]);
  });

  test('403 for a non-member, 404 for an unknown option, 409 once booked', async () => {
    const optionId = (await save(TWIN)).body.option.optionId;
    expect((await vote(optionId, 'T-005')).status).toBe(403);
    expect((await vote('OPT-9999', priya)).status).toBe(404);
    await Group.updateOne({ groupId: 'G-01' }, { $set: { status: 'BOOKED' } });
    expect((await vote(optionId, priya)).body.error.code).toBe('GROUP_CLOSED');
    expect((await unvote(optionId, SARAH)).body.error.code).toBe('GROUP_CLOSED');
  });
});
