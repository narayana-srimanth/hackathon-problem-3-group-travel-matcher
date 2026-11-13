const { skipOf, toPage, paginateArray } = require('../../src/utils/pagination');

describe('pagination', () => {
  test('skipOf', () => {
    expect(skipOf({ page: 1, limit: 20 })).toBe(0);
    expect(skipOf({ page: 3, limit: 10 })).toBe(20);
  });

  test('toPage shape', () => {
    expect(toPage(['a'], { page: 2, limit: 1 }, 5)).toEqual({ items: ['a'], page: 2, limit: 1, total: 5 });
  });

  test('paginateArray slices and reports the full total', () => {
    const all = [1, 2, 3, 4, 5];
    expect(paginateArray(all, { page: 2, limit: 2 })).toEqual({ items: [3, 4], page: 2, limit: 2, total: 5 });
    expect(paginateArray(all, { page: 4, limit: 2 })).toEqual({ items: [], page: 4, limit: 2, total: 5 });
  });
});
