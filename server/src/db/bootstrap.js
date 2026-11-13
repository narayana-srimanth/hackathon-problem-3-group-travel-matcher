// What every boot does once connected: indexes first (so the seed's upserts hit the unique
// indexes), then the insert-only seed.

const { syncAllIndexes } = require('../models');
const { seed } = require('./seed');

async function prepareDatabase(pack) {
  await syncAllIndexes();
  return seed(pack);
}

module.exports = { prepareDatabase };
