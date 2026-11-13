// Database tests run against a real MongoDB (default: the local one from `npm run db:up`),
// in a throwaway database per test file that is dropped afterwards.
// Override with TEST_MONGO_URI=mongodb://host:port.
const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../../src/db/connect');

const TEST_MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017';

async function connectTestDb(label) {
  const dbName = `gtm_test_${label}_${process.pid}_${Date.now().toString(36)}`;
  try {
    await connectDB(TEST_MONGO_URI, { dbName });
  } catch (err) {
    throw new Error(
      `Database tests need MongoDB at ${TEST_MONGO_URI} (start it with \`npm run db:up\`, or set TEST_MONGO_URI).\n${err.message}`,
    );
  }
  return dbName;
}

async function dropTestDb() {
  if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
  await disconnectDB();
}

module.exports = { TEST_MONGO_URI, connectTestDb, dropTestDb };
