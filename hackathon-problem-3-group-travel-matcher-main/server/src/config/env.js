const path = require('path');

const repoRoot = path.resolve(__dirname, '../../..');

const env = {
  PORT: Number(process.env.PORT) || 4000,
  MONGO_URI: process.env.MONGO_URI || 'mongodb://localhost:27017/group-travel-matcher',
  DATA_DIR: path.resolve(process.env.DATA_DIR || path.join(repoRoot, 'data')),
  IMAGES_DIR: path.resolve(process.env.IMAGES_DIR || path.join(repoRoot, 'images')),
  // City photos are ours, not the data pack's, so they live with the server
  CITY_IMAGES_DIR: path.resolve(process.env.CITY_IMAGES_DIR || path.join(repoRoot, 'server', 'assets', 'cities')),
  NODE_ENV: process.env.NODE_ENV || 'development',
  // Optional YYYY-MM-DD: pretend "today" is this date (local testing of reviews, which open
  // only after a trip's check-out). Leave unset to use the real date.
  TODAY: process.env.TODAY || null,
};

module.exports = env;
