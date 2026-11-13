const env = require('../../src/config/env');
const { loadDataPack } = require('../../src/db/dataPack');
const { prepareDatabase } = require('../../src/db/bootstrap');
const { seed } = require('../../src/db/seed');
const { resetDatabase, dropAllCollections } = require('../../src/db/reset');
const { nextId } = require('../../src/db/counters');
const {
  Traveller,
  Group,
  Hotel,
  Room,
  Availability,
  City,
  DepartureCity,
  Interest,
  JoinRequest,
  SavedOption,
  Booking,
} = require('../../src/models');
const { connectTestDb, dropTestDb } = require('../helpers/db');

jest.setTimeout(30000);

const pack = loadDataPack(env.DATA_DIR);
const TOTALS = {
  cities: 5,
  departureCities: 4,
  interests: 16,
  hotels: 49,
  rooms: 125,
  availability: 2500,
  travellers: 24,
  groups: 12,
};
const MODELS = { City, DepartureCity, Interest, Hotel, Room, Availability, Traveller, Group };

async function counts() {
  const [cities, departureCities, interests, hotels, rooms, availability, travellers, groups] =
    await Promise.all(Object.values(MODELS).map((M) => M.countDocuments()));
  return { cities, departureCities, interests, hotels, rooms, availability, travellers, groups };
}

const roomsLeft = async (roomId, date) => (await Availability.findOne({ roomId, date }).lean()).roomsLeft;

const newTraveller = (over = {}) => ({
  travellerId: 'T-1001',
  name: 'Priya Nair',
  age: 26,
  gender: 'FEMALE',
  homeCity: 'Mumbai',
  homeAirport: 'BOM',
  interests: ['TEMPLES', 'STREET_FOOD', 'ADVENTURE'],
  genderPreference: 'SAME_GENDER',
  ...over,
});

beforeAll(() => connectTestDb('seed'));
afterAll(() => dropTestDb());

beforeEach(async () => {
  await dropAllCollections();
});

describe('insert-only seed', () => {
  test('the first boot inserts the whole pack', async () => {
    const summary = await prepareDatabase(pack);
    for (const [name, total] of Object.entries(TOTALS)) {
      expect(summary[name]).toEqual({ total, inserted: total });
    }
    expect(await counts()).toEqual(TOTALS);
  });

  test('a second boot inserts nothing and touches nothing', async () => {
    await prepareDatabase(pack);
    const before = await Traveller.findOne({ travellerId: 'T-001' }).lean();

    const summary = await seed(pack, { now: new Date('2030-01-01T00:00:00Z') });
    expect(Object.values(summary).every((s) => s.inserted === 0)).toBe(true);
    expect(await counts()).toEqual(TOTALS);

    const after = await Traveller.findOne({ travellerId: 'T-001' }).lean();
    expect(after.updatedAt).toEqual(before.updatedAt);
    expect(after.createdAt).toEqual(before.createdAt);
  });

  test('seeded documents match the data pack (G-07 FULL, served image path, timestamps)', async () => {
    await prepareDatabase(pack);
    const g07 = await Group.findOne({ groupId: 'G-07' }).lean();
    expect(g07.status).toBe('FULL');
    expect(g07.memberIds).toHaveLength(3);
    expect(g07.createdAt).toBeInstanceOf(Date);

    const hotel = await Hotel.findOne({ hotelId: 'HTL-KYO-001' }).lean();
    expect(hotel.image).toBe('/static/hotels/HOTEL-BUSINESS-1.jpg');

    const room = await Room.findOne({ roomId: 'RM-KYO-001-A' }).lean();
    expect(room).toMatchObject({ pricePerNightInr: 4760, maxAdults: 2, roomType: 'TWIN' });

    const nights = ['2027-04-10', '2027-04-11', '2027-04-12', '2027-04-13', '2027-04-14'];
    const left = await Promise.all(nights.map((d) => roomsLeft('RM-KYO-001-A', d)));
    expect(left).toEqual([6, 2, 4, 3, 3]);
  });

  test('a restart keeps approvals, sign-ups and reduced availability', async () => {
    await prepareDatabase(pack);
    // Priya approved into G-01, a new sign-up, a booking reduced one night
    await Group.updateOne({ groupId: 'G-01' }, { $push: { memberIds: 'T-002' } });
    await Traveller.create(newTraveller());
    await Availability.updateOne({ roomId: 'RM-KYO-001-A', date: '2027-04-11' }, { $inc: { roomsLeft: -1 } });

    await prepareDatabase(pack); // "restart"

    expect((await Group.findOne({ groupId: 'G-01' }).lean()).memberIds).toEqual(['T-001', 'T-002']);
    expect(await Traveller.exists({ travellerId: 'T-1001' })).toBeTruthy();
    expect(await roomsLeft('RM-KYO-001-A', '2027-04-11')).toBe(1);
    expect(await Traveller.countDocuments()).toBe(25);
  });

  test('a missing seed document is put back (e.g. after a manual delete)', async () => {
    await prepareDatabase(pack);
    await Group.deleteOne({ groupId: 'G-05' });
    const summary = await prepareDatabase(pack);
    expect(summary.groups).toEqual({ total: 12, inserted: 1 });
    expect(await Group.exists({ groupId: 'G-05' })).toBeTruthy();
  });
});

describe('reset', () => {
  test('restores exactly the data pack: original members, roomsLeft, no sign-ups, fresh counters', async () => {
    await prepareDatabase(pack);
    await Group.updateOne({ groupId: 'G-01' }, { $push: { memberIds: 'T-002' } });
    await Availability.updateOne({ roomId: 'RM-KYO-001-A', date: '2027-04-11' }, { $inc: { roomsLeft: -1 } });
    await Traveller.create(newTraveller({ travellerId: await nextId('traveller') }));
    await Booking.create({
      bookingId: await nextId('booking', { year: 2027 }),
      groupId: 'G-01',
      optionId: 'OPT-1001',
      hotelId: 'HTL-KYO-001',
      roomId: 'RM-KYO-001-A',
      roomsBooked: 1,
      nights: ['2027-04-11'],
      memberIds: ['T-001', 'T-002'],
      totalInr: 4760,
      perMemberInr: 2380,
      bookedBy: 'T-001',
    });

    const summary = await resetDatabase(pack);

    expect(summary.groups).toEqual({ total: 12, inserted: 12 });
    expect(await counts()).toEqual(TOTALS);
    expect((await Group.findOne({ groupId: 'G-01' }).lean()).memberIds).toEqual(['T-001']);
    expect(await roomsLeft('RM-KYO-001-A', '2027-04-11')).toBe(2);
    expect(await Traveller.exists({ travellerId: 'T-1001' })).toBeNull();
    expect(await Booking.countDocuments()).toBe(0);
    expect(await nextId('traveller')).toBe('T-1001');
    expect(await nextId('booking', { year: 2027 })).toBe('BK-2027-000001');
  });
});

describe('schemas and indexes', () => {
  beforeEach(() => prepareDatabase(pack));

  const request = (over = {}) => ({
    requestId: 'JR-1001',
    groupId: 'G-01',
    seekerId: 'T-002',
    searchId: 'S-1001',
    matchSnapshot: {
      sharedNights: 5,
      sharedInterests: ['TEMPLES', 'STREET_FOOD'],
      budgetDiffInr: 2000,
      score: 63,
    },
    ...over,
  });

  test('unknown fields are rejected (strict: throw)', async () => {
    await expect(Traveller.create(newTraveller({ password: 'x' }))).rejects.toThrow(/not in schema/);
  });

  test('enums are enforced', async () => {
    await expect(Traveller.create(newTraveller({ gender: 'OTHER' }))).rejects.toThrow(/gender/);
  });

  test('travellerId is unique', async () => {
    await expect(Traveller.create(newTraveller({ travellerId: 'T-001' }))).rejects.toMatchObject({
      code: 11000,
    });
  });

  test('a join request defaults to PENDING with no decision', async () => {
    const created = (await JoinRequest.create(request())).toObject();
    expect(created).toMatchObject({ status: 'PENDING', message: null, decidedBy: null, decidedAt: null });
  });

  test('only one PENDING request per group and seeker (partial unique index)', async () => {
    await JoinRequest.create(request());
    await expect(JoinRequest.create(request({ requestId: 'JR-1002' }))).rejects.toMatchObject({
      code: 11000,
    });
  });

  test('finished requests do not block a new PENDING one', async () => {
    await JoinRequest.create(request({ status: 'REJECTED' }));
    await JoinRequest.create(request({ requestId: 'JR-1002', status: 'WITHDRAWN' }));
    await expect(JoinRequest.create(request({ requestId: 'JR-1003' }))).resolves.toBeTruthy();
  });

  test('the same room can be saved only once per group', async () => {
    const option = (optionId) => ({
      optionId,
      groupId: 'G-01',
      hotelId: 'HTL-KYO-001',
      roomId: 'RM-KYO-001-A',
      savedBy: 'T-001',
      votes: ['T-001'],
      snapshot: {
        memberCount: 1,
        roomsNeeded: 1,
        nights: 5,
        pricePerNightInr: 4760,
        totalInr: 23800,
        perMemberInr: 23800,
      },
    });
    await SavedOption.create(option('OPT-1001'));
    await expect(SavedOption.create(option('OPT-1002'))).rejects.toMatchObject({ code: 11000 });
  });

  test('one booking per group', async () => {
    const booking = (bookingId) => ({
      bookingId,
      groupId: 'G-01',
      optionId: 'OPT-1001',
      hotelId: 'HTL-KYO-001',
      roomId: 'RM-KYO-001-A',
      roomsBooked: 1,
      nights: ['2027-04-10'],
      memberIds: ['T-001'],
      totalInr: 4760,
      perMemberInr: 4760,
      bookedBy: 'T-001',
    });
    await Booking.create(booking('BK-2027-000001'));
    await expect(Booking.create(booking('BK-2027-000002'))).rejects.toMatchObject({ code: 11000 });
  });

  test('one availability row per room per night', async () => {
    await expect(
      Availability.create({ roomId: 'RM-KYO-001-A', date: '2027-04-10', roomsLeft: 9, initialRoomsLeft: 9 }),
    ).rejects.toMatchObject({ code: 11000 });
  });
});

describe('counters', () => {
  test('ids continue the seed formats from 1001', async () => {
    expect(await nextId('traveller')).toBe('T-1001');
    expect(await nextId('traveller')).toBe('T-1002');
    expect(await nextId('group')).toBe('G-1001');
    expect(await nextId('search')).toBe('S-1001');
    expect(await nextId('joinRequest')).toBe('JR-1001');
    expect(await nextId('option')).toBe('OPT-1001');
  });

  test('bookings are BK-<year>-<6 digits> from 000001', async () => {
    expect(await nextId('booking', { year: 2027 })).toBe('BK-2027-000001');
    expect(await nextId('booking', { year: 2027 })).toBe('BK-2027-000002');
    await expect(nextId('booking')).rejects.toThrow(/year/);
  });

  test('an unknown kind is a programming error', async () => {
    await expect(nextId('hotel')).rejects.toThrow(/Unknown id kind/);
  });

  test('parallel calls never hand out the same id', async () => {
    const ids = await Promise.all(Array.from({ length: 25 }, () => nextId('search')));
    expect(new Set(ids).size).toBe(25);
    expect([...ids].sort()).toContain('S-1025');
  });
});
