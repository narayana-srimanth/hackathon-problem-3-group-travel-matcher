const env = require('../../src/config/env');
const { todayIn } = require('../../src/domain/clock');

afterEach(() => {
  env.TODAY = null;
});

describe('todayIn', () => {
  // 16:00 UTC on 14 Apr is already 01:00 on 15 Apr in Tokyo (UTC+9)
  const instant = new Date('2027-04-14T16:00:00Z');

  test("uses the destination's own calendar", () => {
    expect(todayIn('Asia/Tokyo', instant)).toBe('2027-04-15');
    expect(todayIn('Asia/Dubai', instant)).toBe('2027-04-14'); // 20:00 in Dubai (UTC+4)
  });

  test('no timezone → UTC', () => {
    expect(todayIn(null, instant)).toBe('2027-04-14');
  });

  test('TODAY overrides the real date', () => {
    env.TODAY = '2027-04-20';
    expect(todayIn('Asia/Tokyo', instant)).toBe('2027-04-20');
  });

  test('an impossible TODAY is a startup-style error, not a silent wrong date', () => {
    env.TODAY = '2027-02-30';
    expect(() => todayIn('Asia/Tokyo', instant)).toThrow(/TODAY/);
  });
});
