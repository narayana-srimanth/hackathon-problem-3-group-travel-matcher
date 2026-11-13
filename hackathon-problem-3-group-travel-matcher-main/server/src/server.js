const env = require('./config/env');
const { connectDB } = require('./db/connect');
const { loadDataPack } = require('./db/dataPack');
const { prepareDatabase } = require('./db/bootstrap');
const { formatSummary } = require('./db/seed');
const { createApp } = require('./app');

async function main() {
  // 1. Validate the data pack first: a wrong DATA_DIR fails here, even if Mongo is down
  const pack = loadDataPack(env.DATA_DIR);
  // 2. Connect (fails fast with a hint if Mongo isn't running)
  await connectDB(env.MONGO_URI);
  // 3. Indexes + insert-only seed (later boots change nothing)
  const summary = await prepareDatabase(pack);
  console.log(`Seed (inserted/total): ${formatSummary(summary)}`);

  const app = createApp();
  app.listen(env.PORT, () => {
    console.log(`Group Travel Matcher API on http://localhost:${env.PORT}/api/v1`);
  });
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
