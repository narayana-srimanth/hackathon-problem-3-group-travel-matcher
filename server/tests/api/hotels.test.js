const { useTestApp } = require('../helpers/testApp');
const { joinGroup } = require('../helpers/scenario');
const { Availability, Group } = require('../../src/models');
const { priceOption } = require('../../src/domain/pricing');

jest.setTimeout(30000);
const t = useTestApp('hotels');

const SARAH = 'T-001';
const NIGHTS = ['2027-04-10', '2027-04-11', '2027-04-12', '2027-04-13', '2027-04-14'];
let priya;
const hotels = (qs = '', as = SARAH) => t.get(`/api/v1/groups/G-01/hotels${qs}`, as);
const allOptions = (body) => body.items.flatMap((h) => h.options);

beforeAll(async () => {
  await t.reset();
  priya = await joinGroup(t, { groupId: 'G-01', ownerId: SARAH, name: 'Priya Nair' }); // G-01 now has 2 members
});

describe('E21 GET /groups/:groupId/hotels', () => {
  test('context: the group’s own city, nights and party size', async () => {
    const res = await hotels();
    expect(res.status).toBe(200);
    expect(res.body.context).toEqual({
      groupId: 'G-01',
      city: 'Kyoto',
      checkIn: '2027-04-10',
      checkOut: '2027-04-15',
      nights: NIGHTS,
      partySize: 2,
      budgetInr: 60000,
      timezone: 'Asia/Tokyo',
    });
    expect(res.body).toMatchObject({ page: 1, limit: 20 });
  });

  test('the worked example: Gion Corner Twin, 1 room × 5 nights = ₹23,800, ₹11,900 each', async () => {
    const res = await hotels();
    const gion = res.body.items.find((h) => h.hotel.hotelId === 'HTL-KYO-001');
    expect(gion.hotel).toEqual({
      hotelId: 'HTL-KYO-001',
      name: 'Gion Corner Hotel',
      city: 'Kyoto',
      area: 'Gion',
      stars: 3,
      rating: 7.8,
      image: '/static/hotels/HOTEL-BUSINESS-1.jpg',
      checkInFrom: '15:00',
      checkOutUntil: '11:00',
    });
    expect(gion.options.find((o) => o.roomId === 'RM-KYO-001-A')).toEqual({
      roomId: 'RM-KYO-001-A',
      roomType: 'TWIN',
      name: 'Twin Room',
      maxAdults: 2,
      pricePerNightInr: 4760,
      refundable: true,
      roomsNeeded: 1,
      nights: 5,
      totalInr: 23800,
      perMemberInr: 11900,
      budgetSharePct: 19.8,
      minRoomsLeft: 2,
      savedOptionId: null,
    });
  });

  test('only available options, every price checked against the data pack', async () => {
    const res = await hotels('?limit=50');
    const roomsById = new Map(t.pack.rooms.map((r) => [r.roomId, r]));
    const availability = new Map(t.pack.availability.map((a) => [`${a.roomId}|${a.date}`, a.roomsLeft]));
    const kyotoHotels = t.pack.hotels.filter((h) => h.city === 'Kyoto').map((h) => h.hotelId);

    // every returned option is available and correctly priced
    for (const o of allOptions(res.body)) {
      const expected = priceOption(
        roomsById.get(o.roomId),
        { checkIn: '2027-04-10', checkOut: '2027-04-15' },
        2,
        availability,
      );
      expect(expected.available).toBe(true);
      expect(o).toMatchObject({
        totalInr: expected.totalInr,
        perMemberInr: expected.perMemberInr,
        roomsNeeded: expected.roomsNeeded,
      });
      expect(o.totalInr).toBe(o.pricePerNightInr * o.roomsNeeded * o.nights);
    }
    // every left-out Kyoto room really is unavailable
    const returned = new Set(allOptions(res.body).map((o) => o.roomId));
    const leftOut = t.pack.rooms.filter((r) => kyotoHotels.includes(r.hotelId) && !returned.has(r.roomId));
    for (const r of leftOut) {
      expect(
        priceOption(r, { checkIn: '2027-04-10', checkOut: '2027-04-15' }, 2, availability).available,
      ).toBe(false);
    }
    // total counts hotels with at least one option
    expect(res.body.total).toBe(res.body.items.length);
    expect(res.body.items.every((h) => h.options.length > 0)).toBe(true);
  });

  test('default sort: cheapest per-member option first; options sorted within each hotel', async () => {
    const { items } = (await hotels('?limit=50')).body;
    const cheapest = items.map((h) => h.cheapestPerMemberInr);
    expect(cheapest).toEqual([...cheapest].sort((a, b) => a - b));
    for (const h of items) {
      const prices = h.options.map((o) => o.perMemberInr);
      expect(prices).toEqual([...prices].sort((a, b) => a - b));
      expect(h.cheapestPerMemberInr).toBe(prices[0]);
    }
  });

  test.each([
    ['rating', (h) => h.hotel.rating],
    ['stars', (h) => h.hotel.stars],
  ])('sort=%s is descending', async (sort, key) => {
    const values = (await hotels(`?sort=${sort}&limit=50`)).body.items.map(key);
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });

  test('filters: minStars, minRating, roomType, maxPerMemberInr', async () => {
    const stars = (await hotels('?minStars=4&limit=50')).body;
    expect(stars.items.length).toBeGreaterThan(0);
    expect(stars.items.every((h) => h.hotel.stars >= 4)).toBe(true);

    const rating = (await hotels('?minRating=8.5&limit=50')).body;
    expect(rating.items.every((h) => h.hotel.rating >= 8.5)).toBe(true);

    const twin = (await hotels('?roomType=TWIN&limit=50')).body;
    expect(allOptions(twin).every((o) => o.roomType === 'TWIN')).toBe(true);

    const cheap = (await hotels('?maxPerMemberInr=12000&limit=50')).body;
    expect(allOptions(cheap).length).toBeGreaterThan(0);
    expect(allOptions(cheap).every((o) => o.perMemberInr <= 12000)).toBe(true);
    expect(cheap.total).toBe(cheap.items.length); // hotels left with no option drop out
  });

  test('planFor=MAX prices for a full group (3): Twin needs 2 rooms, ₹47,600, ₹15,866.67 each', async () => {
    const res = await hotels('?planFor=MAX&limit=50');
    expect(res.body.context.partySize).toBe(3);
    const twin = allOptions(res.body).find((o) => o.roomId === 'RM-KYO-001-A');
    expect(twin).toMatchObject({ roomsNeeded: 2, totalInr: 47600, perMemberInr: 15866.67 });
  });

  test('pagination over hotels', async () => {
    const all = (await hotels('?limit=50')).body;
    const page2 = (await hotels('?limit=3&page=2')).body;
    expect(page2).toMatchObject({ page: 2, limit: 3, total: all.total });
    expect(page2.items.map((h) => h.hotel.hotelId)).toEqual(
      all.items.slice(3, 6).map((h) => h.hotel.hotelId),
    );
  });

  test('reads live roomsLeft: a sold-out night removes the option', async () => {
    await Availability.updateOne({ roomId: 'RM-KYO-001-A', date: '2027-04-12' }, { $set: { roomsLeft: 0 } });
    const res = await hotels('?limit=50');
    expect(allOptions(res.body).map((o) => o.roomId)).not.toContain('RM-KYO-001-A');
    await Availability.updateOne({ roomId: 'RM-KYO-001-A', date: '2027-04-12' }, { $set: { roomsLeft: 4 } });
  });

  test('every member can search, including a member who isn’t the owner', async () => {
    expect((await hotels('', priya)).status).toBe(200);
  });

  test('still works for a BOOKED group (members can look)', async () => {
    await Group.updateOne({ groupId: 'G-01' }, { $set: { status: 'BOOKED' } });
    expect((await hotels()).status).toBe(200);
    await Group.updateOne({ groupId: 'G-01' }, { $set: { status: 'OPEN' } });
  });

  test.each([
    ['?sort=price'],
    ['?minStars=6'],
    ['?minStars=0'],
    ['?minRating=11'],
    ['?maxPerMemberInr=-1'],
    ['?roomType=SUITE'],
    ['?planFor=ALL'],
  ])('400 for %s', async (qs) => {
    const res = await hotels(qs);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('403 for a non-member, 404 for an unknown group, 401 without identity', async () => {
    expect((await hotels('', 'T-005')).status).toBe(403);
    expect((await t.get('/api/v1/groups/G-999/hotels', SARAH)).status).toBe(404);
    expect((await hotels('', null)).status).toBe(401);
  });
});
