// identify against the real Traveller collection (the plumbing tests use a fake lookup)
const request = require('supertest');
const env = require('../../src/config/env');
const { createApp } = require('../../src/app');
const { createRouter } = require('../../src/middleware/params');
const { identify } = require('../../src/middleware/identify');
const { loadDataPack } = require('../../src/db/dataPack');
const { prepareDatabase } = require('../../src/db/bootstrap');
const { connectTestDb, dropTestDb } = require('../helpers/db');

jest.setTimeout(30000);

const app = createApp({
  mount(api) {
    const r = createRouter();
    r.get('/_probe/whoami', identify, (req, res) => res.json({ actor: req.actor }));
    api.use(r);
  },
});

beforeAll(async () => {
  await connectTestDb('identify');
  await prepareDatabase(loadDataPack(env.DATA_DIR));
});
afterAll(() => dropTestDb());

test('a seeded traveller is loaded as req.actor (no _id)', async () => {
  const res = await request(app).get('/api/v1/_probe/whoami').set('X-Traveller-Id', 'T-001');
  expect(res.status).toBe(200);
  expect(res.body.actor).toMatchObject({ travellerId: 'T-001', name: 'Sarah Thomas', gender: 'FEMALE' });
  expect(res.body.actor._id).toBeUndefined();
});

test('an id that does not exist → 401', async () => {
  const res = await request(app).get('/api/v1/_probe/whoami').set('X-Traveller-Id', 'T-1001');
  expect(res.status).toBe(401);
  expect(res.body.error.code).toBe('UNAUTHENTICATED');
});
