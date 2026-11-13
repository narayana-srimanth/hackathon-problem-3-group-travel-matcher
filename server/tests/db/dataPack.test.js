const fs = require('fs');
const os = require('os');
const path = require('path');
const env = require('../../src/config/env');
const {
  FILES,
  DataPackError,
  readDataPack,
  validateDataPack,
  loadDataPack,
} = require('../../src/db/dataPack');

const pack = loadDataPack(env.DATA_DIR);
const byKey = (list, key, value) => list.find((x) => x[key] === value);

describe('the real data pack', () => {
  test('has the expected sizes', () => {
    const sizes = Object.fromEntries(Object.entries(pack).map(([k, v]) => [k, v.length]));
    expect(sizes).toEqual({
      cities: 5,
      departureCities: 4,
      interests: 16,
      hotels: 49,
      rooms: 125,
      availability: 2500,
      travellers: 24,
      groups: 12,
    });
  });

  test('is consistent', () => {
    expect(validateDataPack(readDataPack(env.DATA_DIR))).toEqual([]);
  });

  test('cities keep catalog order (Japan first) with country and timezone', () => {
    expect(pack.cities.map((c) => c.name)).toEqual(['Tokyo', 'Kyoto', 'Osaka', 'Dubai', 'Abu Dhabi']);
    expect(byKey(pack.cities, 'name', 'Kyoto')).toEqual({
      name: 'Kyoto',
      country: 'Japan',
      countryCode: 'JP',
      timezone: 'Asia/Tokyo',
      sortOrder: 1,
    });
    expect(byKey(pack.cities, 'name', 'Abu Dhabi').timezone).toBe('Asia/Dubai');
  });

  test('departure cities feed the home-city dropdown', () => {
    expect(pack.departureCities.map((d) => `${d.city}/${d.airport}`)).toEqual([
      'Bengaluru/BLR',
      'Delhi/DEL',
      'Mumbai/BOM',
      'Chennai/MAA',
    ]);
  });

  test('travellers are mapped to camelCase', () => {
    expect(byKey(pack.travellers, 'travellerId', 'T-001')).toEqual({
      travellerId: 'T-001',
      name: 'Sarah Thomas',
      age: 27,
      gender: 'FEMALE',
      homeCity: 'Bengaluru',
      homeAirport: 'BLR',
      interests: ['TEMPLES', 'STREET_FOOD', 'PHOTOGRAPHY', 'BUDGET_STAYS'],
      genderPreference: 'SAME_GENDER',
    });
  });

  test('groups get a derived status: G-07 (3 of 3) is FULL, the rest OPEN', () => {
    expect(byKey(pack.groups, 'groupId', 'G-01')).toEqual({
      groupId: 'G-01',
      name: 'Kyoto Spring Temples',
      ownerId: 'T-001',
      memberIds: ['T-001'],
      city: 'Kyoto',
      checkIn: '2027-04-10',
      checkOut: '2027-04-15',
      maxSize: 3,
      budgetInr: 60000,
      itinerary: expect.stringContaining('Fushimi Inari'),
      status: 'OPEN',
    });
    expect(pack.groups.filter((g) => g.status === 'FULL').map((g) => g.groupId)).toEqual(['G-07']);
  });

  test('hotel images become the served /static path', () => {
    expect(byKey(pack.hotels, 'hotelId', 'HTL-KYO-001')).toMatchObject({
      name: 'Gion Corner Hotel',
      city: 'Kyoto',
      stars: 3,
      rating: 7.8,
      image: '/static/hotels/HOTEL-BUSINESS-1.jpg',
      checkInFrom: '15:00',
      checkOutUntil: '11:00',
    });
    for (const h of pack.hotels) {
      expect(fs.existsSync(path.join(env.IMAGES_DIR, 'hotels', path.basename(h.image)))).toBe(true);
    }
  });

  test('rooms take the INR amount as pricePerNightInr (no currency field left)', () => {
    expect(byKey(pack.rooms, 'roomId', 'RM-KYO-001-A')).toEqual({
      roomId: 'RM-KYO-001-A',
      hotelId: 'HTL-KYO-001',
      roomType: 'TWIN',
      name: 'Twin Room',
      maxAdults: 2,
      maxChildren: 0,
      pricePerNightInr: 4760,
      refundable: true,
    });
  });

  test('availability keeps the original value as initialRoomsLeft', () => {
    expect(pack.availability.every((a) => a.initialRoomsLeft === a.roomsLeft)).toBe(true);
    expect(pack.availability.find((a) => a.roomId === 'RM-KYO-001-A' && a.date === '2027-04-11')).toEqual({
      roomId: 'RM-KYO-001-A',
      date: '2027-04-11',
      roomsLeft: 2,
      initialRoomsLeft: 2,
    });
  });
});

describe('validateDataPack finds broken references', () => {
  const broken = (mutate) => {
    const copy = structuredClone(readDataPack(env.DATA_DIR));
    mutate(copy);
    return validateDataPack(copy);
  };

  test.each([
    [
      'room → unknown hotel',
      (p) => (p.rooms[0].hotelId = 'HTL-NOPE'),
      /room RM-TYO-001-A: unknown hotel HTL-NOPE/,
    ],
    [
      'availability → unknown room',
      (p) => (p.availability[0].roomId = 'RM-NOPE'),
      /availability RM-NOPE .*unknown room/,
    ],
    ['impossible availability date', (p) => (p.availability[0].date = '2027-04-31'), /outside 2027-04-01/],
    ['group → unknown owner', (p) => (p.groups[0].ownerId = 'T-999'), /group G-01: unknown owner T-999/],
    ['owner not a member', (p) => (p.groups[0].memberIds = ['T-002']), /owner T-001 is not in member_ids/],
    [
      'more members than max_size',
      (p) => (p.groups[0].memberIds = ['T-001', 'T-002', 'T-003', 'T-004']),
      /4 members exceed max_size 3/,
    ],
    ['group city outside the 5', (p) => (p.groups[0].city = 'Bangkok'), /unknown city 'Bangkok'/],
    [
      'group dates outside the window',
      (p) => (p.groups[0].checkOut = '2027-04-25'),
      /outside the data window/,
    ],
    [
      'check-out before check-in',
      (p) => (p.groups[0].checkOut = '2027-04-09'),
      /check_out must be after check_in/,
    ],
    [
      'traveller → unknown interest',
      (p) => p.travellers[0].interests.push('SKYDIVING'),
      /unknown interest 'SKYDIVING'/,
    ],
    ['traveller → unknown home city', (p) => (p.travellers[0].homeCity = 'Pune'), /unknown home city 'Pune'/],
    ['duplicate hotel id', (p) => p.hotels.push({ ...p.hotels[0] }), /hotels: duplicate key HTL-TYO-001/],
    ['non-INR price', (p) => (p.rooms[0].currency = 'USD'), /currency must be INR/],
  ])('%s', (_name, mutate, expected) => {
    const problems = broken(mutate);
    expect(problems.some((p) => expected.test(p))).toBe(true);
  });
});

describe('loadDataPack failures stop the boot with the reason', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtm-pack-'));
    for (const rel of Object.values(FILES)) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.copyFileSync(path.join(env.DATA_DIR, rel), path.join(dir, rel));
    }
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('a copy of the pack loads', () => {
    expect(loadDataPack(dir).groups).toHaveLength(12);
  });

  test('wrong DATA_DIR → names the missing file', () => {
    const missing = path.join(dir, 'nope');
    expect(() => loadDataPack(missing)).toThrow(DataPackError);
    expect(() => loadDataPack(missing)).toThrow(
      /cannot read catalog\/destinations\.json \(ENOENT\)[\s\S]*Check DATA_DIR/,
    );
  });

  test('a file that is not JSON', () => {
    fs.writeFileSync(path.join(dir, FILES.groups), '[{ oops');
    expect(() => loadDataPack(dir)).toThrow(/problem-3\/groups\.json is not valid JSON/);
  });

  test('a file with the wrong structure', () => {
    fs.writeFileSync(path.join(dir, FILES.destinations), '{}');
    expect(() => loadDataPack(dir)).toThrow(/unexpected file structure/);
  });

  test('a broken reference lists every problem', () => {
    const groups = JSON.parse(fs.readFileSync(path.join(dir, FILES.groups), 'utf8'));
    groups[0].owner_id = 'T-999';
    groups[1].city = 'Bangkok';
    fs.writeFileSync(path.join(dir, FILES.groups), JSON.stringify(groups));
    try {
      loadDataPack(dir);
      throw new Error('expected loadDataPack to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(DataPackError);
      expect(err.problems).toEqual(
        expect.arrayContaining(['group G-01: unknown owner T-999', "group G-02: unknown city 'Bangkok'"]),
      );
    }
  });
});
