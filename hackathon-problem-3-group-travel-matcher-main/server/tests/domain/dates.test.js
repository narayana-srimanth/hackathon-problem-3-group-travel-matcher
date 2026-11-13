const {
  toDay,
  fromDay,
  isValidIsoDate,
  addDays,
  nightCount,
  nightsOf,
  sharedNights,
  sharedRange,
  inDataWindow,
} = require('../../src/domain/dates');

const stay = (checkIn, checkOut) => ({ checkIn, checkOut });

describe('day numbers', () => {
  test('round trip', () => {
    for (const iso of ['2027-04-01', '2027-04-20', '2028-02-29', '1999-12-31']) {
      expect(fromDay(toDay(iso))).toBe(iso);
    }
  });

  test('consecutive dates differ by exactly 1 (no DST drift)', () => {
    expect(toDay('2027-03-29') - toDay('2027-03-28')).toBe(1);
    expect(toDay('2027-05-01') - toDay('2027-04-30')).toBe(1);
  });

  test('addDays crosses month ends', () => {
    expect(addDays('2027-04-30', 1)).toBe('2027-05-01');
    expect(addDays('2027-04-01', -1)).toBe('2027-03-31');
  });
});

describe('isValidIsoDate', () => {
  test.each(['2027-04-01', '2027-04-20', '2028-02-29', '2027-04-30'])('%s is valid', (s) => {
    expect(isValidIsoDate(s)).toBe(true);
  });

  test.each(['2027-04-31', '2027-02-29', '2027-13-01', '2027-00-10', '2027-4-1', '2027/04/01', '', 'abc'])(
    '%s is invalid',
    (s) => {
      expect(isValidIsoDate(s)).toBe(false);
    },
  );

  test.each([null, undefined, 20270401, {}])('%p (not a string) is invalid', (v) => {
    expect(isValidIsoDate(v)).toBe(false);
  });
});

describe('nights', () => {
  test("Sarah's 10→15 Apr is 5 nights, check-out day excluded", () => {
    const s = stay('2027-04-10', '2027-04-15');
    expect(nightCount(s)).toBe(5);
    expect(nightsOf(s)).toEqual(['2027-04-10', '2027-04-11', '2027-04-12', '2027-04-13', '2027-04-14']);
  });

  test('an empty or reversed stay has no nights', () => {
    expect(nightsOf(stay('2027-04-10', '2027-04-10'))).toEqual([]);
    expect(nightsOf(stay('2027-04-12', '2027-04-10'))).toEqual([]);
  });
});

describe('sharedNights / sharedRange', () => {
  test('Sarah 10→15 and Priya 9→16 share 5 nights, 10–15 Apr', () => {
    const a = stay('2027-04-10', '2027-04-15');
    const b = stay('2027-04-09', '2027-04-16');
    expect(sharedNights(a, b)).toBe(5);
    expect(sharedNights(b, a)).toBe(5);
    expect(sharedRange(a, b)).toEqual({ sharedFrom: '2027-04-10', sharedTo: '2027-04-15' });
  });

  test('10→15 and 14→18 share 1 night', () => {
    expect(sharedNights(stay('2027-04-10', '2027-04-15'), stay('2027-04-14', '2027-04-18'))).toBe(1);
  });

  test('back-to-back stays share 0 nights and no range', () => {
    const a = stay('2027-04-10', '2027-04-14');
    const b = stay('2027-04-14', '2027-04-18');
    expect(sharedNights(a, b)).toBe(0);
    expect(sharedRange(a, b)).toBeNull();
  });

  test('disjoint stays share 0 (never negative)', () => {
    expect(sharedNights(stay('2027-04-01', '2027-04-03'), stay('2027-04-10', '2027-04-12'))).toBe(0);
  });

  test('a stay inside another shares all its nights', () => {
    expect(sharedNights(stay('2027-04-01', '2027-04-20'), stay('2027-04-05', '2027-04-08'))).toBe(3);
  });
});

describe('inDataWindow', () => {
  test('the full window 1→20 Apr is inside', () => {
    expect(inDataWindow(stay('2027-04-01', '2027-04-20'))).toBe(true);
  });

  test('a check-in before 1 Apr is outside', () => {
    expect(inDataWindow(stay('2027-03-31', '2027-04-05'))).toBe(false);
  });

  test('a check-out after 20 Apr is outside', () => {
    expect(inDataWindow(stay('2027-04-15', '2027-04-21'))).toBe(false);
  });

  test('another year is outside', () => {
    expect(inDataWindow(stay('2026-04-10', '2026-04-12'))).toBe(false);
  });
});
