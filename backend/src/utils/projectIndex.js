// Which stored project keys are really the same project.
//
// The import gives each project a `projectKey` slug (developer + name + locality), but the same
// project often arrives under two keys because its locality or developer was written differently:
// Lodha Altus is "lodha-group-lodha-altus-borivali" and "...-borivali-east"; Marathon Nexzone is
// listed in "New Panvel" and "Panvel". (148 such pairs in the data.) Keys are merged when they
// share a project name and city AND their localities overlap, so the same name in unrelated
// localities ("Sai Mauli" in Titwala and in Vasai) stays separate.
const { Property } = require('../models');
const { PUBLIC } = require('./propertyQuery');
const { projectKeyOf } = require('./property');
const { cached } = require('./cache');

// Locality words that say nothing about where a project is.
const GENERIC = new Set(['west', 'east', 'north', 'south', 'sector', 'road', 'the', 'new', 'old', 'phase', 'near', 'nagar']);
const placeWords = (locality) =>
  new Set(String(locality || '').toLowerCase().match(/\p{L}{3,}/gu)?.filter((w) => !GENERIC.has(w)) || []);
const nameKey = (doc) => {
  const name = String(doc.projectName ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const city = String(doc.city ?? '').toLowerCase().trim();
  return name && city ? `${name}|${city}` : null;
};

function buildIndex(docs) {
  // Every stored key's place words, bucketed by project name + city.
  const buckets = new Map();
  for (const d of docs) {
    const nk = nameKey(d);
    if (!nk) continue;
    const key = projectKeyOf(d);
    if (!buckets.has(nk)) buckets.set(nk, new Map());
    const keys = buckets.get(nk);
    if (!keys.has(key)) keys.set(key, new Set());
    for (const w of placeWords(d.locality)) keys.get(key).add(w);
  }
  // Within a bucket, keys whose places overlap (or that name no place) join one group, named
  // after its first key in sorted order so the result is stable.
  const canonical = new Map();
  for (const keys of buckets.values()) {
    if (keys.size < 2) continue;
    const list = [...keys.keys()].sort();
    const parent = new Map(list.map((k) => [k, k]));
    const root = (k) => (parent.get(k) === k ? k : root(parent.get(k)));
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = keys.get(list[i]);
        const b = keys.get(list[j]);
        if (!a.size || !b.size || [...a].some((w) => b.has(w))) {
          const [ra, rb] = [root(list[i]), root(list[j])].sort();
          parent.set(rb, ra);
        }
      }
    }
    for (const k of list) if (root(k) !== k) canonical.set(k, root(k));
  }
  // Group key -> every stored key in it (for loading all of a project's units).
  const members = new Map();
  for (const [k, root] of canonical) {
    if (!members.has(root)) members.set(root, [root]);
    members.get(root).push(k);
  }
  return {
    // The project a listing belongs to, after merging.
    groupOf: (doc) => {
      const key = projectKeyOf(doc);
      return canonical.get(key) || key;
    },
    // Stored keys that make up a group.
    keysOf: (group) => members.get(group) || [group],
  };
}

// Rebuilt every 10 minutes (listings change only on import / approval).
const loadProjectIndex = cached(10 * 60 * 1000, async () =>
  buildIndex(await Property.find(PUBLIC).select('_id projectKey projectName city locality').lean()),
);

module.exports = { loadProjectIndex, buildIndex };
