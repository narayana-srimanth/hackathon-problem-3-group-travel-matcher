// npm run seed — insert whatever is missing from the data pack; never overwrites.
const env = require('../config/env');
const { connectDB, disconnectDB } = require('../db/connect');
const { loadDataPack } = require('../db/dataPack');
const { prepareDatabase } = require('../db/bootstrap');
const { formatSummary } = require('../db/seed');

async function main() {
  const pack = loadDataPack(env.DATA_DIR);
  await connectDB(env.MONGO_URI);
  const summary = await prepareDatabase(pack);
  console.log(`Seed (inserted/total): ${formatSummary(summary)}`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
