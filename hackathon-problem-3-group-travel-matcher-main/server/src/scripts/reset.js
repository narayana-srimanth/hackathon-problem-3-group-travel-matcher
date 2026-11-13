// npm run reset — drop all 13 collections and re-seed: back to exactly the data pack.
const env = require('../config/env');
const { connectDB, disconnectDB } = require('../db/connect');
const { loadDataPack } = require('../db/dataPack');
const { resetDatabase } = require('../db/reset');
const { formatSummary } = require('../db/seed');

async function main() {
  const pack = loadDataPack(env.DATA_DIR); // validate before dropping anything
  await connectDB(env.MONGO_URI);
  console.log(`Resetting ${env.MONGO_URI} …`);
  const summary = await resetDatabase(pack);
  console.log(`Reset done (inserted/total): ${formatSummary(summary)}`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
