const env = require('./config/env');
const { connectDB } = require('./db/connect');
const { createApp } = require('./app');

async function main() {
  await connectDB(env.MONGO_URI);
  // Phase 3 adds: validateDataPack(env.DATA_DIR) → seed() → syncIndexes()
  const app = createApp();
  app.listen(env.PORT, () => {
    console.log(`Group Travel Matcher API on http://localhost:${env.PORT}/api/v1`);
  });
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
