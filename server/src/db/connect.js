const mongoose = require('mongoose');

mongoose.set('strictQuery', true);

// options.dbName overrides the database in the URI (tests use one database per file)
async function connectDB(uri, options = {}) {
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000, ...options });
  } catch (err) {
    const hint = 'Is MongoDB running? Start it with: docker compose up -d mongo';
    throw new Error(`Could not connect to MongoDB at ${uri}: ${err.message}. ${hint}`);
  }
  return mongoose.connection;
}

async function disconnectDB() {
  await mongoose.disconnect();
}

// true only when the connection is open and the server answers a ping
async function isDbUp() {
  if (mongoose.connection.readyState !== 1) return false;
  try {
    await mongoose.connection.db.admin().ping();
    return true;
  } catch {
    return false;
  }
}

module.exports = { connectDB, disconnectDB, isDbUp };
