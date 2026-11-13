const { useTestApp } = require('../helpers/testApp');
const { joinGroup, signUp, KYOTO_SEARCH } = require('../helpers/scenario');
const { Availability, Booking, Group, JoinRequest } = require('../../src/models');

jest.setTimeout(30000);
const t = useTestApp('booking');

const SARAH = 'T-001';
const TWIN = 'RM-KYO-001-A';
const NIGHTS = ['2027-04-10', '2027-04-11', '2027-04-12', '2027-04-13', '2027-04-14'];
const ORIGINAL = [6, 2, 4, 3, 3]; // Twin roomsLeft on 10–14 Apr in the data pack

const roomsLeft = async (date, roomId = TWIN) =>
  (await Availability.findOne({ roomId, date }).lean()).roomsLeft;
const twinNights = () => Promise.all(NIGHTS.map((d) => roomsLeft(d)));
const saveTwin = async (groupId = 'G-01', as = SARAH) =>
  (await t.post(`/api/v1/groups/${groupId}/saved-options`, { roomId: TWIN }, as)).body.option.optionId;
const quote = (optionId, as = SARAH, groupId = 'G-01') =>
  t.post(`/api/v1/groups/${groupId}/booking/quote`, { optionId }, as);
const book = (optionId, as = SARAH, groupId = 'G-01') =>
  t.post(`/api/v1/groups/${groupId}/booking`, { optionId }, as);
const getBooking = (as = SARAH, groupId = 'G-01') => t.get(`/api/v1/groups/${groupId}/booking`, as);

// Sarah's second Kyoto group on the same nights (she is its only member → 1 Twin room)
const sarahsSecondGroup = async () =>
  (
    await t.post(
      '/api/v1/groups',
      {
        name: 'Kyoto Again',
        city: 'Kyoto',
        checkIn: '2027-04-10',
        checkOut: '2027-04-15',
        maxSize: 3,
        budgetInr: 60000,
      },
      SARAH,
    )
  ).body.group.groupId;

let priya;
beforeEach(async () => {
  await t.reset();
  priya = await joinGroup(t, { groupId: 'G-01', ownerId: SARAH, name: 'Priya Nair' }); // G-01: Sarah + Priya
});

describe('E27 POST /groups/:groupId/booking/quote', () => {
  test('fresh numbers for the confirmation popup (the API spec example)', async () => {
    const optionId = await saveTwin();
    const res = await quote(optionId, priya);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      optionId,
      hotelName: 'Gion Corner Hotel',
      roomName: 'Twin Room',
      checkIn: '2027-04-10',
      checkOut: '2027-04-15',
      nights: 5,
      roomsNeeded: 1,
      memberCount: 2,
      pricePerNightInr: 4760,
      totalInr: 23800,
      perMemberInr: 11900,
      available: true,
      members: [
        { travellerId: SARAH, name: 'Sarah Thomas' },
        { travellerId: priya, name: 'Priya Nair' },
      ],
    });
  });

  test('read-only, and available:false when a night has sold out since saving', async () => {
    const optionId = await saveTwin();
    await Availability.updateOne({ roomId: TWIN, date: '2027-04-13' }, { $set: { roomsLeft: 0 } });
    const res = await quote(optionId);
    expect(res.body.available).toBe(false);
    expect(await Booking.countDocuments()).toBe(0);
  });

  test('403 non-member, 404 unknown option, 400 missing optionId', async () => {
    const optionId = await saveTwin();
    expect((await quote(optionId, 'T-005')).status).toBe(403);
    expect((await quote('OPT-9999')).status).toBe(404);
    expect((await t.post('/api/v1/groups/G-01/booking/quote', {}, SARAH)).status).toBe(400);
  });
});

describe('E28 POST /groups/:groupId/booking', () => {
  test('any member books: 201, roomsLeft 6,2,4,3,3 → 5,1,3,2,2, other nights untouched', async () => {
    const optionId = await saveTwin();
    const before9 = await roomsLeft('2027-04-09');
    const before15 = await roomsLeft('2027-04-15');

    const res = await book(optionId, priya); // not the owner: any member can finalise
    expect(res.status).toBe(201);
    expect(res.body.booking).toMatchObject({
      bookingId: 'BK-2027-000001',
      groupId: 'G-01',
      optionId,
      hotel: { hotelId: 'HTL-KYO-001', name: 'Gion Corner Hotel' },
      room: { roomId: TWIN, name: 'Twin Room' },
      roomsBooked: 1,
      nights: NIGHTS,
      memberIds: [SARAH, priya],
      totalInr: 23800,
      perMemberInr: 11900,
      status: 'CONFIRMED',
      bookedBy: priya,
      createdAt: expect.stringMatching(/Z$/),
    });
    expect(res.body.group).toMatchObject({ groupId: 'G-01', status: 'BOOKED' });

    expect(await twinNights()).toEqual([5, 1, 3, 2, 2]);
    expect(await roomsLeft('2027-04-09')).toBe(before9);
    expect(await roomsLeft('2027-04-15')).toBe(before15);
  });

  test('E29 returns the booking; before booking it is a 404 the client reads as "not booked"', async () => {
    const before = await getBooking();
    expect(before.status).toBe(404);
    expect(before.body.error).toMatchObject({ code: 'NOT_FOUND', message: 'This group has no booking yet.' });

    const optionId = await saveTwin();
    const booked = (await book(optionId)).body.booking;
    const res = await getBooking(priya);
    expect(res.status).toBe(200);
    expect(res.body.booking).toEqual(booked);
  });

  test('the cost split uses the members at booking time (a stale option is priced live)', async () => {
    const optionId = await saveTwin(); // saved for 2
    await joinGroup(t, { groupId: 'G-01', ownerId: SARAH, name: 'Anika' }); // 3 members now
    const res = await book(optionId);
    expect(res.body.booking).toMatchObject({ roomsBooked: 2, totalInr: 47600, perMemberInr: 15866.67 });
    expect(res.body.booking.memberIds).toHaveLength(3);
    expect(await twinNights()).toEqual(ORIGINAL.map((n) => n - 2));
  });

  test('a night without enough rooms: 422 naming it, and NOTHING changes', async () => {
    const optionId = await saveTwin();
    await joinGroup(t, { groupId: 'G-01', ownerId: SARAH, name: 'Anika' }); // 3 members → 2 Twin rooms
    await Availability.updateOne({ roomId: TWIN, date: '2027-04-13' }, { $set: { roomsLeft: 1 } });
    const nightsBefore = await twinNights();

    const res = await book(optionId);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ROOMS_UNAVAILABLE');
    // 2 rooms needed: 11 Apr has exactly 2 (fine); 13 Apr has 1 → the first night that fails
    expect(res.body.error.details[0]).toEqual({
      date: '2027-04-13',
      roomsLeft: 1,
      roomsNeeded: 2,
      issue: 'Only 1 left on 13 Apr; 2 needed',
    });
    expect(await twinNights()).toEqual(nightsBefore);
    expect(await Booking.countDocuments()).toBe(0);
    expect((await Group.findOne({ groupId: 'G-01' }).lean()).status).toBe('FULL');
  });

  test('a night that sells out mid-booking: every reduced night is given back', async () => {
    const optionId = await saveTwin();
    // Pre-check sees enough rooms; then the last night is taken by "someone else" before step 3 reaches it
    const original = Availability.updateOne.bind(Availability);
    const spy = jest.spyOn(Availability, 'updateOne').mockImplementation(async (filter, update) => {
      if (filter.date === '2027-04-14' && update.$inc)
        await original({ roomId: TWIN, date: '2027-04-14' }, { $set: { roomsLeft: 0 } });
      return original(filter, update);
    });
    try {
      const res = await book(optionId);
      expect(res.status).toBe(422);
      expect(res.body.error.details[0]).toMatchObject({
        date: '2027-04-14',
        roomsLeft: 0,
        issue: 'Sold out on 14 Apr',
      });
    } finally {
      spy.mockRestore();
    }
    expect(await twinNights()).toEqual([6, 2, 4, 3, 0]); // first 4 nights restored; the 14th is the other buyer's
    expect(await Booking.countDocuments()).toBe(0);
    expect((await Group.findOne({ groupId: 'G-01' }).lean()).status).toBe('OPEN');
  });

  test('double-click: two parallel bookings → one 201, one 409, rooms reduced once', async () => {
    const optionId = await saveTwin();
    const [a, b] = await Promise.all([book(optionId, SARAH), book(optionId, priya)]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect([a, b].find((r) => r.status === 409).body.error.code).toBe('ALREADY_BOOKED');
    expect(await Booking.countDocuments()).toBe(1);
    expect(await twinNights()).toEqual([5, 1, 3, 2, 2]);
  });

  test('two groups racing for the last room on one night: one wins, the loser changes nothing', async () => {
    const other = await sarahsSecondGroup();
    const optionA = await saveTwin('G-01');
    const optionB = await saveTwin(other);
    await Availability.updateOne({ roomId: TWIN, date: '2027-04-11' }, { $set: { roomsLeft: 1 } });

    const results = await Promise.all([book(optionA, SARAH, 'G-01'), book(optionB, SARAH, other)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 422]);
    expect(await Booking.countDocuments()).toBe(1);
    // exactly one room taken on every night, never below zero
    expect(await twinNights()).toEqual([5, 0, 3, 2, 2]);
  });

  test('a booking reduces availability for every other group (their hotel search sees it)', async () => {
    const other = await sarahsSecondGroup();
    const twinIn = async (groupId) =>
      (await t.get(`/api/v1/groups/${groupId}/hotels?limit=50`, SARAH)).body.items
        .flatMap((h) => h.options)
        .find((o) => o.roomId === TWIN);
    expect((await twinIn(other)).minRoomsLeft).toBe(2);
    await book(await saveTwin());
    expect((await twinIn(other)).minRoomsLeft).toBe(1);
  });

  test('after booking: pending requests CLOSED, options frozen, no second booking, no new requests', async () => {
    // a pending request from another seeker, and a second saved option
    const anika = await signUp(t, 'Anika');
    const searchId = (await t.post('/api/v1/searches', KYOTO_SEARCH, anika)).body.search.searchId;
    const pending = (await t.post('/api/v1/groups/G-01/join-requests', { searchId }, anika)).body.request
      .requestId;
    const optionId = await saveTwin();

    expect((await book(optionId)).status).toBe(201);

    expect((await JoinRequest.findOne({ requestId: pending }).lean()).status).toBe('CLOSED');
    expect((await t.get('/api/v1/groups/G-01', SARAH)).body.group.viewer.pendingRequestCount).toBe(0);
    expect(
      (await t.post(`/api/v1/groups/G-01/saved-options/${optionId}/vote`, undefined, priya)).body.error.code,
    ).toBe('GROUP_CLOSED');
    expect((await book(optionId)).body.error.code).toBe('ALREADY_BOOKED');
    expect((await quote(optionId)).body.error.code).toBe('ALREADY_BOOKED');
    const again = await t.post('/api/v1/groups/G-01/join-requests', { searchId }, anika);
    expect(again.body.error.code).toBe('GROUP_CLOSED');
    // G-01 no longer appears in anyone's matches
    const matches = await t.get(`/api/v1/searches/${searchId}/matches`, anika);
    expect(matches.body.matches.items.map((m) => m.groupId)).not.toContain('G-01');
  });

  test('a booking survives the rest of the app: E10 shows BOOKED, the hotel search still works', async () => {
    await book(await saveTwin());
    const mine = await t.get('/api/v1/me/groups', priya);
    expect(mine.body.memberOf[0]).toMatchObject({ groupId: 'G-01', status: 'BOOKED' });
    expect((await t.get('/api/v1/groups/G-01/hotels', priya)).status).toBe(200);
  });

  test('403 non-member, 404 unknown option or group, 400 missing optionId, 401 without identity', async () => {
    const optionId = await saveTwin();
    expect((await book(optionId, 'T-005')).status).toBe(403);
    expect((await book('OPT-9999')).status).toBe(404);
    expect((await t.post('/api/v1/groups/G-999/booking', { optionId }, SARAH)).status).toBe(404);
    expect((await t.post('/api/v1/groups/G-01/booking', {}, SARAH)).status).toBe(400);
    expect((await book(optionId, null)).status).toBe(401);
    expect((await getBooking('T-005')).status).toBe(403);
    expect(await Booking.countDocuments()).toBe(0);
  });
});
