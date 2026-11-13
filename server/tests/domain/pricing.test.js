const { round2, round1, partySizeFor, budgetSharePct, priceOption } = require('../../src/domain/pricing');
const { nightsOf } = require('../../src/domain/dates');
const { roomsById, availability, availabilityRows, group } = require('../helpers/fixtures');

const TWIN = roomsById.get('RM-KYO-001-A');
const G01 = group('G-01');

describe('golden #10–11: the worked example (G-01, Gion Corner Twin at ₹4,760)', () => {
  test('the data has 6, 2, 4, 3, 3 rooms left on 10–14 Apr', () => {
    expect(TWIN).toMatchObject({ maxAdults: 2, pricePerNightInr: 4760 });
    expect(nightsOf(G01).map((d) => availability.get(`RM-KYO-001-A|${d}`))).toEqual([6, 2, 4, 3, 3]);
  });

  test('#10 2 members → 1 room, ₹23,800 total, ₹11,900 each', () => {
    expect(priceOption(TWIN, G01, 2, availability)).toEqual({
      roomId: 'RM-KYO-001-A',
      pricePerNightInr: 4760,
      roomsNeeded: 1,
      nights: 5,
      totalInr: 23800,
      perMemberInr: 11900,
      available: true,
      minRoomsLeft: 2,
      firstUnavailableDate: null,
    });
  });

  test('#11 3 members → 2 rooms, ₹47,600, ₹15,866.67 each', () => {
    expect(priceOption(TWIN, G01, 3, availability)).toMatchObject({
      roomsNeeded: 2,
      totalInr: 47600,
      perMemberInr: 15866.67,
      available: true,
    });
  });

  test('4 members → 2 rooms, ₹47,600, ₹11,900 each', () => {
    expect(priceOption(TWIN, G01, 4, availability)).toMatchObject({
      roomsNeeded: 2,
      totalInr: 47600,
      perMemberInr: 11900,
    });
  });

  test('totalInr = price × rooms × nights for every party size', () => {
    for (let size = 1; size <= 4; size += 1) {
      const o = priceOption(TWIN, G01, size, availability);
      expect(o.roomsNeeded).toBe(Math.ceil(size / TWIN.maxAdults));
      expect(o.totalInr).toBe(TWIN.pricePerNightInr * o.roomsNeeded * o.nights);
    }
  });
});

describe('golden #12: availability', () => {
  test('the data pack has 61 sold-out nights', () => {
    expect(availabilityRows.filter((a) => a.roomsLeft === 0)).toHaveLength(61);
  });

  test('a stay that includes a sold-out night is unavailable, naming the night', () => {
    const soldOut = availabilityRows.find((a) => a.roomsLeft === 0 && a.date > '2027-04-01');
    const room = roomsById.get(soldOut.roomId);
    const stay = { checkIn: '2027-04-01', checkOut: '2027-04-20' };
    const option = priceOption(room, stay, 1, availability);
    expect(option.available).toBe(false);
    expect(option.minRoomsLeft).toBe(0);
    expect(option.firstUnavailableDate <= soldOut.date).toBe(true);
  });

  test('needing more rooms than are left on one night makes it unavailable', () => {
    // 4 members need 2 Twin rooms; the night of 11 Apr has exactly 2 left → still available
    expect(priceOption(TWIN, G01, 4, availability).available).toBe(true);
    // with 1 room left on 11 Apr it would fail on that night
    const tight = new Map(availability).set('RM-KYO-001-A|2027-04-11', 1);
    expect(priceOption(TWIN, G01, 3, tight)).toMatchObject({
      available: false,
      firstUnavailableDate: '2027-04-11',
    });
  });

  test('a missing availability row counts as sold out', () => {
    const option = priceOption(TWIN, G01, 2, new Map());
    expect(option).toMatchObject({ available: false, minRoomsLeft: 0, firstUnavailableDate: '2027-04-10' });
  });
});

describe('helpers', () => {
  test('round2 / round1', () => {
    expect(round2(47600 / 3)).toBe(15866.67);
    expect(round2(1.005)).toBe(1.01);
    expect(round2(11900)).toBe(11900);
    expect(round1(19.83)).toBe(19.8);
    expect(round1(0.05)).toBe(0.1);
  });

  test('budgetSharePct: ₹11,900 of a ₹60,000 budget is 19.8%', () => {
    expect(budgetSharePct(11900, 60000)).toBe(19.8);
  });

  test('partySizeFor: CURRENT members or MAX size', () => {
    const g = { memberIds: ['T-1', 'T-2'], maxSize: 4 };
    expect(partySizeFor(g)).toBe(2);
    expect(partySizeFor(g, 'CURRENT')).toBe(2);
    expect(partySizeFor(g, 'MAX')).toBe(4);
  });

  test('an invalid party size throws', () => {
    expect(() => priceOption(TWIN, G01, 0, availability)).toThrow();
    expect(() => priceOption(TWIN, G01, 1.5, availability)).toThrow();
  });
});
