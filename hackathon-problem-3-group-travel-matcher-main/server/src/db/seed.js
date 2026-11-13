// Insert-only seed: updateOne({ key }, { $setOnInsert: doc }, { upsert: true }) per document.
// A restart never overwrites approvals, sign-ups or the roomsLeft a booking reduced; it only
// adds what is missing. `npm run reset` is the way back to the exact data pack.

const { City, DepartureCity, Interest, Hotel, Room, Availability, Traveller, Group } = require('../models');

// Dependency order: catalog first, then the people, then the groups that reference them
const SEED_PLAN = [
  { name: 'cities', Model: City, key: ['name'] },
  { name: 'departureCities', Model: DepartureCity, key: ['city'] },
  { name: 'interests', Model: Interest, key: ['interest'] },
  { name: 'hotels', Model: Hotel, key: ['hotelId'] },
  { name: 'rooms', Model: Room, key: ['roomId'] },
  { name: 'availability', Model: Availability, key: ['roomId', 'date'] },
  { name: 'travellers', Model: Traveller, key: ['travellerId'] },
  { name: 'groups', Model: Group, key: ['groupId'] },
];

const pick = (doc, fields) => Object.fromEntries(fields.map((f) => [f, doc[f]]));

// → { cities: { total, inserted }, … }
async function seed(pack, { now = new Date() } = {}) {
  const summary = {};
  for (const { name, Model, key } of SEED_PLAN) {
    const docs = pack[name];
    // Timestamps go inside $setOnInsert, and Mongoose's own are off, so a later boot
    // doesn't even touch updatedAt on existing documents.
    const withTimes = Model.schema.options.timestamps
      ? docs.map((d) => ({ ...d, createdAt: now, updatedAt: now }))
      : docs;
    const ops = withTimes.map((doc) => ({
      updateOne: { filter: pick(doc, key), update: { $setOnInsert: doc }, upsert: true, timestamps: false },
    }));
    const result = ops.length > 0 ? await Model.bulkWrite(ops, { ordered: false }) : null;
    summary[name] = { total: docs.length, inserted: result ? result.upsertedCount : 0 };
  }
  return summary;
}

const formatSummary = (summary) =>
  Object.entries(summary)
    .map(([name, { total, inserted }]) => `${name} ${inserted}/${total}`)
    .join(', ');

module.exports = { SEED_PLAN, seed, formatSummary };
