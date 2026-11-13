// Drops all 14 collections and re-seeds: the result is exactly the data pack
// (original members, original roomsLeft, no sign-ups). Run before a demo slot.

const { ALL_MODELS, syncAllIndexes } = require('../models');
const { seed } = require('./seed');

const NAMESPACE_NOT_FOUND = 26;

async function dropAllCollections() {
  for (const Model of ALL_MODELS) {
    try {
      await Model.collection.drop();
    } catch (err) {
      if (err.code !== NAMESPACE_NOT_FOUND) throw err; // already absent is fine
    }
  }
}

async function resetDatabase(pack) {
  await dropAllCollections();
  await syncAllIndexes();
  return seed(pack);
}

module.exports = { dropAllCollections, resetDatabase };
