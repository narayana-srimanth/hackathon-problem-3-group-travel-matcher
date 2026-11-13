const { withLock } = require('../../src/db/locks');
const Lock = require('../../src/models/Lock');
const { connectTestDb, dropTestDb } = require('../helpers/db');

jest.setTimeout(30000);

beforeAll(async () => {
  await connectTestDb('locks');
  await Lock.syncIndexes();
});
afterAll(() => dropTestDb());
beforeEach(() => Lock.deleteMany({}));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('callers with the same key run one at a time', async () => {
  let inside = 0;
  let maxInside = 0;
  const work = () =>
    withLock('membership:T-1001', async () => {
      inside += 1;
      maxInside = Math.max(maxInside, inside);
      await sleep(30);
      inside -= 1;
    });
  await Promise.all([work(), work(), work(), work()]);
  expect(maxInside).toBe(1);
});

test('different keys do not wait for each other', async () => {
  let inside = 0;
  let maxInside = 0;
  const work = (key) =>
    withLock(key, async () => {
      inside += 1;
      maxInside = Math.max(maxInside, inside);
      await sleep(50);
      inside -= 1;
    });
  await Promise.all([work('membership:T-1'), work('membership:T-2')]);
  expect(maxInside).toBe(2);
});

test('returns the result and releases the lock, also when fn throws', async () => {
  await expect(withLock('k', async () => 42)).resolves.toBe(42);
  await expect(
    withLock('k', async () => {
      throw new Error('boom');
    }),
  ).rejects.toThrow('boom');
  expect(await Lock.countDocuments()).toBe(0);
});

test('an expired lock (crashed holder) is taken over', async () => {
  await Lock.create({ _id: 'k', token: 'dead', expiresAt: new Date(Date.now() - 1000) });
  await expect(withLock('k', async () => 'ok')).resolves.toBe('ok');
});

test('a lock that stays held gives up with 409 CONFLICT', async () => {
  await Lock.create({ _id: 'k', token: 'other', expiresAt: new Date(Date.now() + 60000) });
  await expect(withLock('k', async () => 'never')).rejects.toMatchObject({ status: 409, code: 'CONFLICT' });
});
