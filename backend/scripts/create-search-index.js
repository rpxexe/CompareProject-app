// Creates (or updates) the Atlas Search index used for free-text property search:
//   npm run search:index
// Then set ATLAS_SEARCH_INDEX=properties_search in backend/.env and restart the server.
//
// Only adds a search index next to the collection: no listing is read into or written by this
// script. Remove it again with `npm run search:index -- --drop`.
// If your cluster tier does not allow creating search indexes from a driver, create it in the
// Atlas UI instead (Atlas Search > Create Search Index > JSON Editor) with the JSON this script
// prints using `--print`.
const env = require('../src/config/env');
const mongoose = require('mongoose');
const { connectDb } = require('../src/config/db');
const { INDEX_NAME, INDEX_DEFINITION } = require('../src/utils/atlasSearch');

const args = new Set(process.argv.slice(2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  if (args.has('--print')) {
    console.log(JSON.stringify({ name: INDEX_NAME, collection: env.mongoCollection, definition: INDEX_DEFINITION }, null, 2));
    return;
  }
  if (!env.mongoUri) {
    console.error('MONGODB_URI is not set in backend/.env');
    process.exit(1);
  }
  await connectDb();
  const col = mongoose.connection.db.collection(env.mongoCollection);
  const existing = (await col.listSearchIndexes(INDEX_NAME).toArray())[0];

  if (args.has('--drop')) {
    if (existing) await col.dropSearchIndex(INDEX_NAME);
    console.log(existing ? `Dropped search index "${INDEX_NAME}".` : `No search index "${INDEX_NAME}" to drop.`);
    await mongoose.disconnect();
    return;
  }

  if (existing) {
    await col.updateSearchIndex(INDEX_NAME, INDEX_DEFINITION);
    console.log(`Updating search index "${INDEX_NAME}" on "${env.mongoCollection}"...`);
  } else {
    await col.createSearchIndex({ name: INDEX_NAME, definition: INDEX_DEFINITION });
    console.log(`Creating search index "${INDEX_NAME}" on "${env.mongoCollection}"...`);
  }

  // Atlas builds the index in the background; wait until it answers queries (usually < 1 min).
  for (let i = 0; i < 60; i += 1) {
    const idx = (await col.listSearchIndexes(INDEX_NAME).toArray())[0];
    if (idx?.queryable && idx.status === 'READY') {
      console.log(`Ready. Set ATLAS_SEARCH_INDEX=${INDEX_NAME} in backend/.env and restart the server.`);
      await mongoose.disconnect();
      return;
    }
    process.stdout.write(`  status: ${idx?.status || 'pending'}\r`);
    await sleep(5000);
  }
  console.log('\nStill building after 5 minutes; it will finish in the background. Check Atlas > Atlas Search.');
  await mongoose.disconnect();
})().catch((e) => {
  console.error('Failed:', e.message);
  process.exit(1);
});
