// Atlas Search (Lucene) for the free-text part of property searches.
//
// MongoDB Atlas runs a Lucene search engine next to the database - the same engine Elasticsearch
// is built on - so we get ranked, typo-tolerant, prefix-aware search without a second server or a
// sync job. It handles only the words left after parseSearch has turned "2 bhk under 1 cr for
// rent" into filters; every filter still runs as a normal MongoDB query.
//
// Off unless ATLAS_SEARCH_INDEX names a search index on the properties collection (created with
// `npm run search:index`). When it's off, or Atlas Search errors, searches fall back to the
// regex word matching in utils/propertyQuery, which behaves the same minus the ranking.
const mongoose = require('mongoose');
const env = require('../config/env');
const { ALIASES } = require('./searchText');
const { cachedByKey } = require('./cache');

const INDEX_NAME = 'properties_search';

// Text fields searched. Names and places also get an autocomplete form (word prefixes), so a
// half-typed word ("andh", "lodha alt") already matches.
const NAME_FIELDS = ['projectName', 'title', 'name'];
const PLACE_FIELDS = ['locality', 'city', 'location.locality', 'location.city'];
const OTHER_FIELDS = ['developerName', 'builderName', 'propertyType', 'propertyGroup', 'address', 'state', 'pincode', 'amenities'];
const AUTOCOMPLETE_FIELDS = ['projectName', 'title', 'locality', 'city', 'developerName'];
const ALL_TEXT = [...NAME_FIELDS, ...PLACE_FIELDS, ...OTHER_FIELDS];

const text = { type: 'string', analyzer: 'lucene.standard' };
const autocomplete = { type: 'autocomplete', tokenization: 'edgeGram', minGrams: 2, maxGrams: 15, foldDiacritics: true };
// The index: only the fields above, so it stays small. `npm run search:index` creates / updates it.
const INDEX_DEFINITION = {
  mappings: {
    dynamic: false,
    fields: {
      ...Object.fromEntries(
        ALL_TEXT.filter((f) => !f.includes('.')).map((f) => [f, AUTOCOMPLETE_FIELDS.includes(f) ? [text, autocomplete] : text]),
      ),
      location: { type: 'document', fields: { city: text, locality: text } },
    },
  },
};

// Typos allowed per word: none for short words or numbers (pincodes), 1 up to 5 letters, then 2.
// The first letter must be right, which keeps "pune" from matching "dune".
function fuzzyFor(word) {
  if (!/^\p{L}{4,}$/u.test(word)) return undefined;
  return { maxEdits: word.length <= 5 ? 1 : 2, prefixLength: 1 };
}

// One clause per typed word; every word has to match somewhere (like the regex search), but each
// may match fuzzily, by prefix, or by an alias ("bengaluru" -> Bangalore). Ranking: a hit on the
// project name counts most, then real place fields, then the listing title (scraped titles often
// stuff in nearby place names: "... Dahisar West Mumbai Andheri Dahisar 690 Sq Ft"), then anything.
const BOOST = { projectName: 6, place: 4, title: 2, prefix: { projectName: 3, locality: 3, city: 2, title: 1, developerName: 1 } };
const boost = (value) => ({ boost: { value } });
function wordClause(word) {
  const terms = ALIASES.get(word) || [word];
  const fuzzy = fuzzyFor(word);
  const should = [
    { text: { query: terms, path: 'projectName', score: boost(BOOST.projectName) } },
    { text: { query: terms, path: PLACE_FIELDS, score: boost(BOOST.place) } },
    { text: { query: terms, path: ['title', 'name'], score: boost(BOOST.title) } },
    // Typos only for the word as typed: fuzzy short aliases ("blr" with 2 edits) match nearly anything.
    { text: { query: word, path: ALL_TEXT, ...(fuzzy ? { fuzzy } : {}) } },
    ...(terms.length > 1 ? [{ text: { query: terms, path: ALL_TEXT } }] : []),
    ...AUTOCOMPLETE_FIELDS.map((path) => ({ autocomplete: { query: word, path, score: boost(BOOST.prefix[path]) } })),
  ];
  return { compound: { should, minimumShouldMatch: 1 } };
}

// Most matches considered per search (the collection is ~8k listings; a broad word like a city
// matches a few thousand).
const MAX_HITS = 5000;
function searchPipeline(words, index = INDEX_NAME) {
  return [
    { $search: { index, compound: { must: words.map(wordClause) } } },
    { $limit: MAX_HITS },
    { $project: { _id: 1, score: { $meta: 'searchScore' } } },
  ];
}

// After an error (index missing, Atlas hiccup) Atlas Search is skipped for a while so every
// search doesn't pay for a failing call; the regex search answers meanwhile.
const RETRY_AFTER_MS = 5 * 60 * 1000;
let failedAt = 0;
const enabled = () => !!env.atlasSearchIndex && !env.isTest && Date.now() - failedAt > RETRY_AFTER_MS;

// The same words are searched several times per request (list, count, "did it find anything?"),
// and again when paging, so results are kept for a minute.
const runSearch = cachedByKey(60 * 1000, 500, async (key) => {
  const rows = await mongoose.connection.db
    .collection(env.mongoCollection)
    .aggregate(searchPipeline(JSON.parse(key), env.atlasSearchIndex), { maxTimeMS: 5000 })
    .toArray();
  return { ids: rows.map((r) => r._id), scores: new Map(rows.map((r) => [String(r._id), r.score])) };
});

// Atlas answers a query on a missing or still-building index with zero results, not an error, so
// a typo in ATLAS_SEARCH_INDEX or a dropped index would silently empty every search. The index is
// therefore checked (every 5 minutes) and used only when it exists and is queryable.
const indexReady = require('./cache').cached(5 * 60 * 1000, async () => {
  try {
    const [idx] = await mongoose.connection.db
      .collection(env.mongoCollection)
      .listSearchIndexes(env.atlasSearchIndex)
      .toArray();
    const ready = !!idx?.queryable;
    if (!ready) console.warn(`[search] Atlas Search index "${env.atlasSearchIndex}" is ${idx ? idx.status : 'missing'}; using regex search.`);
    return ready;
  } catch (err) {
    console.warn('[search] Could not check the Atlas Search index; using regex search:', err.message);
    return false;
  }
});

// Listings matching `words`, best first: { ids, scores }, or null when Atlas Search is off,
// not ready or failed (the caller then matches words with regexes).
async function textMatches(words) {
  if (!words.length || !enabled() || !(await indexReady())) return null;
  try {
    return await runSearch(JSON.stringify(words));
  } catch (err) {
    failedAt = Date.now();
    console.warn(`[search] Atlas Search failed, using regex search for ${RETRY_AFTER_MS / 60000} min:`, err.message);
    return null;
  }
}

module.exports = { INDEX_NAME, INDEX_DEFINITION, searchPipeline, wordClause, textMatches, enabled };
