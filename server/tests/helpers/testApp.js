// The real app on a throwaway, freshly seeded test database.
//   const t = useTestApp('travellers');   // registers beforeAll/afterAll
//   await request(t.app).get(...)
//   await t.reset();                      // back to exactly the data pack
const request = require('supertest');
const env = require('../../src/config/env');
const { createApp } = require('../../src/app');
const { loadDataPack } = require('../../src/db/dataPack');
const { prepareDatabase } = require('../../src/db/bootstrap');
const { resetDatabase } = require('../../src/db/reset');
const { connectTestDb, dropTestDb } = require('./db');

const pack = loadDataPack(env.DATA_DIR);

function useTestApp(label) {
  const ctx = {
    app: createApp(),
    pack,
    reset: () => resetDatabase(pack),
    // request builders with or without the identity header
    get: (url, as) => withActor(request(ctx.app).get(url), as),
    post: (url, body, as) => withActor(request(ctx.app).post(url), as).send(body),
    del: (url, as) => withActor(request(ctx.app).delete(url), as),
  };
  beforeAll(async () => {
    await connectTestDb(label);
    await prepareDatabase(pack);
  }, 60000);
  afterAll(() => dropTestDb());
  return ctx;
}

const withActor = (req, travellerId) => (travellerId ? req.set('X-Traveller-Id', travellerId) : req);

module.exports = { useTestApp, pack };
