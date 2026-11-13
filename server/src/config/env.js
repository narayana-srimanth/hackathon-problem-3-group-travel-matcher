const path = require('path');

const repoRoot = path.resolve(__dirname, '../../..');

const env = {
  PORT: Number(process.env.PORT) || 4000,
  MONGO_URI: process.env.MONGO_URI || 'mongodb://localhost:27017/group-travel-matcher',
  DATA_DIR: path.resolve(process.env.DATA_DIR || path.join(repoRoot, 'data')),
  IMAGES_DIR: path.resolve(process.env.IMAGES_DIR || path.join(repoRoot, 'images')),
  NODE_ENV: process.env.NODE_ENV || 'development',
};

module.exports = env;
