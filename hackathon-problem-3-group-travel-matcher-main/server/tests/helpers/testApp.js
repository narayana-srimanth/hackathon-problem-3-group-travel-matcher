// The real app on a throwaway, freshly seeded test database.
//   const t = useTestApp('travellers');   // registers beforeAll/afterAll
//   await request(t.app).get(...)
//   await t.reset();                      // back to exactly the data pack
const request = require('supertest');
const env = require('../../src/config/env');
const { createApp } = require('../../src/app');
const { loadDataPack } = require('../../src/db/dataPack');
const { prepareDatabase } = require('../../src/db/bootstrap');
const { seed } = require('../../src/db/seed');
const {
  Traveller,
  Group,
  Search,
  JoinRequest,
  SavedOption,
  Booking,
  Review,
  Message,
  Counter,
  Availability,
} = require('../../src/models');
const { connectTestDb, dropTestDb } = require('./db');

const pack = loadDataPack(env.DATA_DIR);
const seedTravellerIds = pack.travellers.map((t) => t.travellerId);

// Same end state as `npm run reset` (exactly the data pack), without dropping collections and
// rebuilding indexes: wipe user data, restore roomsLeft, re-insert the seed groups.
async function fastReset() {
  await Promise.all([
    ...[Search, JoinRequest, SavedOption, Booking, Review, Message, Counter, Group].map((M) => M.deleteMany({})),
    Traveller.deleteMany({ travellerId: { $nin: seedTravellerIds } }),
    Availability.updateMany({ $expr: { $ne: ['$roomsLeft', '$initialRoomsLeft'] } }, [
      { $set: { roomsLeft: '$initialRoomsLeft' } },
    ]),
  ]);
  const onlyGroups = Object.fromEntries(Object.keys(pack).map((k) => [k, k === 'groups' ? pack.groups : []]));
  await seed(onlyGroups);
}

function useTestApp(label) {
  const ctx = {
    app: createApp(),
    pack,
    reset: fastReset,
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
