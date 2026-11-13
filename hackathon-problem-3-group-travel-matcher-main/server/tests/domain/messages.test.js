const {
  inr,
  plural,
  formatDay,
  formatRange,
  orList,
  andList,
  genderLabel,
} = require('../../src/domain/messages');

test('inr uses Indian digit grouping', () => {
  expect(inr(24800)).toBe('₹24,800');
  expect(inr(125000)).toBe('₹1,25,000');
  expect(inr(15866.67)).toBe('₹15,866.67');
});

test('plural', () => {
  expect(plural(1, 'night')).toBe('1 night');
  expect(plural(0, 'night')).toBe('0 nights');
  expect(plural(2, 'place')).toBe('2 places');
});

test('dates', () => {
  expect(formatDay('2027-04-09')).toBe('9 Apr');
  expect(formatRange('2027-04-10', '2027-04-15')).toBe('10–15 Apr');
  expect(formatRange('2027-03-30', '2027-04-02')).toBe('30 Mar–2 Apr');
});

test('lists', () => {
  expect(orList(['A'])).toBe('A');
  expect(orList(['A', 'B'])).toBe('A or B');
  expect(orList(['A', 'B', 'C'])).toBe('A, B or C');
  expect(andList(['A', 'B'])).toBe('A and B');
});

test('genderLabel: seeker side ↔ owner side', () => {
  const f = (gender, genderPreference) => ({ gender, genderPreference });
  expect(genderLabel(f('FEMALE', 'SAME_GENDER'), f('FEMALE', 'SAME_GENDER'))).toBe(
    'Female only ↔ female only',
  );
  expect(genderLabel(f('MALE', 'ANY'), f('FEMALE', 'ANY'))).toBe('Anyone ↔ anyone');
});
