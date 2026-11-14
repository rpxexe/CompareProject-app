// One row per project instead of one per unit.
//
// Imported projects are stored once per unit: Radhey Skye is 13 records (five 3 BHK sizes, 2 BHK,
// ...), all sharing a `projectKey`. A plain list therefore repeats the same project name. Lists
// that ask for `group=project` collapse the ranked units into projects, keeping the order in which
// each project's best-ranked unit appeared, so every sort (relevance, price, newest, rating) keeps
// its meaning. Each project row is its best-ranked unit plus a summary of the units that matched:
//   projectUnits   how many units matched
//   bhkOptions     their BHKs, ascending ("1RK" first)
//   priceFrom      lowest price among them, formatted ("₹1.38 Cr"); priceFromValue is the number
const { formatPrice, projectKeyOf, unitBasics } = require('./property');

// Only what's needed to rank and summarise units (and, via projectName / city / locality, to match
// them to merged projects - see utils/projectIndex); full documents are loaded for the page's rows only.
const UNIT_FIELDS = '_id projectKey projectName city locality price minPrice maxPrice amount bhk bedrooms bedroom';
// Upper bound on units scanned per request (the whole collection is ~8k today).
const SCAN_CAP = 20000;

// Sorting every matching unit inside MongoDB fails on the real collection: a blocking sort runs on
// whole documents and passes the 32 MB in-memory limit. So units are fetched unsorted with only
// UNIT_FIELDS plus the sort keys (small rows), then ranked here in the same order MongoDB would use.
const getPath = (o, path) => path.split('.').reduce((v, k) => (v == null ? undefined : v[k]), o);
// MongoDB's cross-type order (missing/null < numbers < strings < objects < ObjectId < bool < date).
function bsonRank(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return 1;
  if (typeof v === 'string') return 2;
  if (typeof v === 'boolean') return 6;
  if (v instanceof Date) return 7;
  if (v && v._bsontype === 'ObjectId') return 5;
  return 3;
}
function compareValues(a, b) {
  const ra = bsonRank(a);
  const rb = bsonRank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 0) return 0;
  if (ra === 7) return a.getTime() - b.getTime();
  if (ra === 1) return a - b;
  if (ra === 6) return Number(a) - Number(b);
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}
// `order` is a MongoDB sort object ({ createdAt: -1, _id: -1 }).
function sortRows(rows, order) {
  const keys = Object.entries(order || {});
  return [...rows].sort((x, y) => {
    for (const [path, dir] of keys) {
      const c = compareValues(getPath(x, path), getPath(y, path));
      if (c) return c * dir;
    }
    return 0;
  });
}
// The projection for a scan: unit fields plus whatever the sort reads.
const scanFields = (order) => [UNIT_FIELDS, ...Object.keys(order || {})].join(' ');

const bhkRank = (b) => (b === '1RK' ? 0.5 : Number.isFinite(Number(b)) ? Number(b) : 1000);
const sortBhks = (list) => [...list].sort((a, b) => bhkRank(a) - bhkRank(b) || String(a).localeCompare(String(b)));

// `batches`: arrays of unit rows, each already in rank order (relevance passes two: title matches,
// then the rest). `groupOf` names a row's project (utils/projectIndex merges keys that are the
// same project). Returns projects in first-appearance order.
function collapseUnits(batches, groupOf = projectKeyOf) {
  const groups = new Map();
  for (const rows of batches) {
    for (const row of rows) {
      const key = groupOf(row);
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { key, lead: row._id, units: 0, from: null, bhks: new Set() }));
      g.units += 1;
      const { price, bhk } = unitBasics(row);
      if (price != null && (g.from == null || price < g.from)) g.from = price;
      if (bhk) g.bhks.add(bhk);
    }
  }
  return [...groups.values()];
}

// Adds the project summary to a normalized listing (its lead unit).
function withProjectSummary(item, group) {
  return {
    ...item,
    projectKey: group.key,
    projectUnits: group.units,
    bhkOptions: sortBhks(group.bhks),
    priceFromValue: group.from,
    priceFrom: group.from != null ? formatPrice(group.from) : item.priceMin || item.price || '',
  };
}

module.exports = { UNIT_FIELDS, SCAN_CAP, collapseUnits, withProjectSummary, sortBhks, sortRows, scanFields };
