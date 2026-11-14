const mongoose = require("mongoose");
const { Property, User, Review, PropertyRating } = require("../models");
const { AppError, bad } = require("../utils/errors");
const {
  isPropertyId,
  requirePropertyId,
  propertyIdValues,
  propertyIdMatch,
  paging,
  str,
} = require("../utils/validate");
const { normalizeProperty, unitBasics } = require("../utils/property");
const { SCAN_CAP, UNIT_FIELDS, collapseUnits, withProjectSummary, sortRows, scanFields } = require("../utils/projectGroups");
const { loadProjectIndex } = require("../utils/projectIndex");
const { textMatches } = require("../utils/atlasSearch");

// The MongoDB filter for a query. Free-text words go through Atlas Search when it's on (ranked,
// typo-tolerant; `scores` ranks relevance), otherwise through regexes (`scores` is null).
async function filterFor(query) {
  const hits = await textMatches(searchWords(query));
  return { filter: buildPropertyFilter(query, hits ? { textIds: hits.ids } : {}), scores: hits?.scores || null };
}
const countFor = async (query) => Property.countDocuments((await filterFor(query)).filter);
const {
  buildPropertyFilter,
  searchWords,
  buildSort,
  titleMatch,
  SECTIONS,
  PUBLIC,
  isPublic,
} = require("../utils/propertyQuery");
const { summarise, publicRating } = require("../utils/rating");
const { cached, cachedByKey } = require("../utils/cache");
const { z, validate, text } = require("../utils/zod");
const { buildVocabulary, correctSearch, dropWord, nearWords, parseSearch, replaceWord } = require("../utils/searchText");

const RATING_ERROR = "Rating must be a whole number from 1 to 5";
const reviewSchema = z.object({
  rating: z.coerce.number({ error: RATING_ERROR }).int({ error: RATING_ERROR }).min(1, { error: RATING_ERROR }).max(5, { error: RATING_ERROR }),
  comment: text(500).default(""),
});

// Filter lists and section counts change only when listings are added/approved; a short
// cache turns several full-collection scans per app launch into one every couple of minutes.
const FACETS_TTL_MS = 2 * 60 * 1000;

async function withRatings(docs) {
  const items = docs.map(normalizeProperty);
  if (!items.length) return items;
  const ratings = await PropertyRating.find({
    property: { $in: items.flatMap((i) => propertyIdValues(i.id)) },
  }).lean();
  const map = new Map(ratings.map((r) => [String(r.property), r]));
  for (const it of items) it.rating = publicRating(map.get(it.id));
  return items;
}

// Words in public listing names and places, for correcting misspelt searches.
const VOCAB_FIELDS = ["title", "name", "projectName", "locality", "city", "developerName", "builderName"];
const loadSearchVocabulary = cached(10 * 60 * 1000, async () =>
  buildVocabulary(await Property.find(PUBLIC).select(VOCAB_FIELDS.join(" ")).limit(50000).lean(), VOCAB_FIELDS));

// Forgiving search: people type whatever is convenient, so a search that finds nothing is retried.
//   1. Typos, joined and split words are fixed against the words in the listings
//      ("andhery" -> "andheri", "lodhaaltus" -> "lodha altus", "white field" -> "whitefield").
//   2. Still nothing: the words that rule everything out are dropped, keeping as much of what was
//      typed as finds something ("lodha altus luxury" -> "lodha altus"). Filters named in the text
//      (BHK, budget, rent...) and the app's own filters are never dropped.
// (Aliases - "bengaluru" for Bangalore - apply to every search, in wordRegex.)
// Returns the query to use and, when it changed, the text actually searched, so the app can say
// "Showing results for ...". Only reported when it finds something.
async function resolveSearch(query) {
  const search = str(query.search, 80);
  const finds = async (text) => (await countFor({ ...query, search: text })) > 0;
  if (!search || (await finds(search))) return { query, corrected: null };
  const vocab = await loadSearchVocabulary();
  const fixed = correctSearch(search, vocab);
  if (fixed && (await finds(fixed))) return { query: { ...query, search: fixed }, corrected: fixed };
  const relaxed = await relaxSearch(query, fixed || search, finds, vocab);
  if (relaxed) return { query: { ...query, search: relaxed }, corrected: relaxed };
  return { query, corrected: null };
}

const RELAX_ROUNDS = 3;
// Bends the search until it finds something. Each round first tries swapping one word for a
// close listing word (a real word, but not the one meant: "altis" for "altus"), then dropping a
// single word (latest typed first - usually the extra detail); if no single word is to blame,
// the word matching the fewest listings on its own goes and the next round tries again. A
// search is never relaxed down to nothing: what's left must still name a word or a filter.
async function relaxSearch(query, text, finds, vocab) {
  const meaningful = (t) => {
    const parsed = parseSearch(t);
    return parsed.words.length > 0 || Object.keys(parsed.params).length > 0;
  };
  let current = text;
  for (let round = 0; round < RELAX_ROUNDS; round += 1) {
    const { words } = parseSearch(current);
    if (!words.length) return null;
    for (const w of [...words].reverse()) {
      for (const alt of nearWords(w, vocab)) {
        const t = replaceWord(current, w, alt);
        if (await finds(t)) return t;
      }
    }
    for (const w of [...words].reverse()) {
      const t = dropWord(current, w);
      if (meaningful(t) && (await finds(t))) return t;
    }
    if (words.length < 2) return null;
    const alone = await Promise.all(
      words.map((w) => countFor({ ...query, search: w })),
    );
    current = dropWord(current, words[alone.indexOf(Math.min(...alone))]);
  }
  return null;
}

// `?group=project`: one row per project instead of one per unit (see utils/projectGroups).
const wantsProjects = (query) => str(query.group, 10) === "project";

// One page of projects. `batches` are unit rows in rank order (light fields); `fullDocs`, when the
// caller already has full documents, saves loading the page's lead units again.
async function projectPage(batches, skip, limit, fullDocs) {
  const groups = collapseUnits(batches, (await loadProjectIndex()).groupOf);
  const slice = groups.slice(skip, skip + limit);
  const known = new Map((fullDocs || []).map((d) => [String(d._id), d]));
  const missing = slice.map((g) => g.lead).filter((id) => !known.has(String(id)));
  if (missing.length) {
    for (const d of await Property.find({ _id: { $in: missing } }).lean()) known.set(String(d._id), d);
  }
  const rows = slice.filter((g) => known.has(String(g.lead)));
  const items = await withRatings(rows.map((g) => known.get(String(g.lead))));
  return { items: items.map((it, i) => withProjectSummary(it, rows[i])), total: groups.length };
}

// All matching units as small rows, ranked by `order`. Sorted in Node, not MongoDB: see sortRows.
const scanUnits = async (filter, order) =>
  sortRows(await Property.find(filter).select(scanFields(order)).limit(SCAN_CAP).lean(), order);

// GET /api/properties – search / filter / sort / paginate. Everything is done in MongoDB.
const getProperties = async (req, res) => {
  const { page, limit, skip } = paging(req.query);
  const { query, corrected } = await resolveSearch(req.query);
  const correctedSearch = corrected || undefined;
  const { filter, scores } = await filterFor(query);
  const sort = str(query.sort, 12);
  const grouped = wantsProjects(query);
  const reply = ({ items, total }) =>
    res.json({ items, total, correctedSearch, page, pages: Math.max(1, Math.ceil(total / limit)) });

  if (sort === "rating") {
    const ranked = await PropertyRating.find({ count: { $gte: 1 } })
      .sort({ average: -1, count: -1 })
      .limit(300)
      .lean();
    const order = ranked.map((r) => String(r.property));
    const docs = order.length
      ? await Property.find({
          $and: [filter, { _id: { $in: ranked.map((r) => r.property) } }],
        }).lean()
      : [];
    docs.sort(
      (a, b) => order.indexOf(String(a._id)) - order.indexOf(String(b._id)),
    );
    if (grouped) return reply(await projectPage([docs], skip, limit, docs));
    const items = await withRatings(docs.slice(skip, skip + limit));
    return res.json({
      items,
      total: docs.length,
      correctedSearch,
      page,
      pages: Math.max(1, Math.ceil(docs.length / limit)),
    });
  }

  // Relevance with Atlas Search: best search score first (ties keep the usual order).
  if (sort === "relevance" && scores) {
    const score = (r) => scores.get(String(r._id)) || 0;
    const rows = (await scanUnits(filter, buildSort(sort))).sort((a, b) => score(b) - score(a));
    if (grouped) return reply(await projectPage([rows], skip, limit));
    const ids = rows.slice(skip, skip + limit).map((r) => r._id);
    const byId = new Map((await Property.find({ _id: { $in: ids } }).lean()).map((d) => [String(d._id), d]));
    const docs = ids.map((id) => byId.get(String(id))).filter(Boolean);
    return reply({ items: await withRatings(docs), total: rows.length });
  }

  // Relevance without it: listings whose name has every word first, then the rest.
  const title = sort === "relevance" && !scores ? titleMatch(query) : null;
  if (title) {
    // Title matches first, then the rest; each block keeps the relevance order.
    const first = { $and: [filter, title] };
    const rest = { $and: [filter, { $nor: [title] }] };
    if (grouped) {
      const order = buildSort(sort);
      const batches = await Promise.all([scanUnits(first, order), scanUnits(rest, order)]);
      return reply(await projectPage(batches, skip, limit));
    }
    const [nFirst, nRest] = await Promise.all([
      Property.countDocuments(first),
      Property.countDocuments(rest),
    ]);
    const order = buildSort(sort);
    const docs = [];
    if (skip < nFirst)
      docs.push(...(await Property.find(first).sort(order).skip(skip).limit(limit).lean()));
    if (docs.length < limit)
      docs.push(
        ...(await Property.find(rest)
          .sort(order)
          .skip(Math.max(0, skip - nFirst))
          .limit(limit - docs.length)
          .lean()),
      );
    const total = nFirst + nRest;
    return res.json({
      items: await withRatings(docs),
      total,
      correctedSearch,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  }

  if (grouped) return reply(await projectPage([await scanUnits(filter, buildSort(sort))], skip, limit));

  const [docs, total] = await Promise.all([
    Property.find(filter).sort(buildSort(sort)).skip(skip).limit(limit).lean(),
    Property.countDocuments(filter),
  ]);
  res.json({
    items: await withRatings(docs),
    total,
    correctedSearch,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
};

// GET /api/properties/count – same filters as the list, just the total. Powers the live
// "Show N results" button while filters are being edited.
const getPropertyCount = async (req, res) => {
  const { query, corrected } = await resolveSearch(req.query);
  const { filter } = await filterFor(query);
  // Grouped lists count projects, so "Show N results" matches what the list will show.
  // `?by=city` also returns where the matches are (most first, up to 8 cities), for "available in"
  // suggestions when a search finds nothing in the chosen city.
  const byCity = str(query.by, 10) === "city";
  let total;
  let cities;
  if (wantsProjects(query) || byCity) {
    const { groupOf } = await loadProjectIndex();
    const rows = await Property.find(filter).select(UNIT_FIELDS).limit(SCAN_CAP).lean();
    const keyOf = wantsProjects(query) ? groupOf : (r) => String(r._id);
    total = new Set(rows.map(keyOf)).size;
    if (byCity) {
      const perCity = new Map();
      for (const r of rows) {
        const city = typeof r.city === "string" ? r.city.trim() : "";
        if (!city) continue;
        if (!perCity.has(city)) perCity.set(city, new Set());
        perCity.get(city).add(keyOf(r));
      }
      cities = [...perCity]
        .map(([city, keys]) => ({ city, count: keys.size }))
        .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city))
        .slice(0, 8);
    }
  } else total = await Property.countDocuments(filter);
  res.json({ total, ...(cities ? { cities } : {}), correctedSearch: corrected || undefined });
};

// GET /api/properties/categories – which "New Project" categories actually have data.
const loadCategoryCounts = cached(FACETS_TTL_MS, async () => {
  const keys = [
    "projects",
    "new-launch",
    "upcoming",
    "under-construction",
    "ready",
  ];
  const counts = await Promise.all(
    keys.map((k) => Property.countDocuments({ $and: [PUBLIC, SECTIONS[k]] })),
  );
  const out = {};
  keys.forEach((k, i) => {
    out[k] = counts[i];
  });
  return out;
});

const getPropertyCategories = async (req, res) => {
  res.json({ counts: await loadCategoryCounts() });
};

// Filter option lists used by the app's filter sheet (values that really exist in the data).
const loadFacets = cached(FACETS_TTL_MS, async () => {
  const [cities, localities, types, developers, builders] = await Promise.all([
    Property.distinct("city", PUBLIC),
    Property.distinct("locality", PUBLIC),
    Property.distinct("propertyType", PUBLIC),
    Property.distinct("developerName", PUBLIC),
    Property.distinct("builderName", PUBLIC),
  ]);
  const clean = (arr, limit = 100) =>
    [...new Set(arr.filter((v) => typeof v === "string" && v.trim()).map((v) => v.trim()))]
      .sort((a, b) => a.localeCompare(b))
      .slice(0, limit);
  return {
    cities: clean(cities),
    localities: clean(localities),
    propertyTypes: clean(types),
    developers: clean([...developers, ...builders], 300),
  };
});

const getFacets = async (req, res) => {
  res.json(await loadFacets());
};

// ----- Market insights (Home "Market Analytics") ----------------------------------------
// Real aggregates over current public listings - no time series exists in the data, so this
// reports price by configuration and listings by construction stage for a city.
const INSIGHT_FIELDS = {
  price: 1, minPrice: 1, maxPrice: 1, amount: 1,
  bhk: 1, bedrooms: 1, bedroom: 1,
  possessionStatus: 1, possession: 1, status: 1,
  propertyType: 1, propertyGroup: 1, city: 1, locality: 1,
};
const STAGES = ["Ready To Move", "Under Construction", "New Launch"];
const median = (nums) => {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

const loadInsights = cachedByKey(10 * 60 * 1000, 50, async (city) => {
  const filter = buildPropertyFilter(city ? { city } : {});
  const docs = await Property.find(filter).select(INSIGHT_FIELDS).limit(20000).lean();
  const items = docs.map(normalizeProperty);

  const byBhk = new Map();
  const byStage = new Map(STAGES.map((st) => [st, 0]));
  const prices = [];
  for (const p of items) {
    if (p.priceValue > 0) prices.push(p.priceValue);
    const n = parseInt(p.bhk, 10);
    const rk = /rk/i.test(p.bhk);
    if ((rk || n >= 1) && p.priceValue > 0) {
      const key = rk ? "RK" : n >= 4 ? "4+" : String(n);
      if (!byBhk.has(key)) byBhk.set(key, []);
      byBhk.get(key).push(p.priceValue);
    }
    const status = (p.possessionStatus || "").replace(/\s+/g, " ").trim().toLowerCase();
    const stage = STAGES.find((st) => st.toLowerCase() === status);
    if (stage) byStage.set(stage, byStage.get(stage) + 1);
  }
  return {
    city: city || "",
    listings: items.length,
    medianPrice: median(prices),
    priceByBhk: ["RK", "1", "2", "3", "4+"]
      .filter((k) => byBhk.has(k))
      .map((k) => ({ bhk: k, medianPrice: median(byBhk.get(k)), listings: byBhk.get(k).length })),
    listingsByStage: STAGES.map((stage) => ({ stage, listings: byStage.get(stage) })),
    generatedAt: new Date().toISOString(),
  };
});

const getInsights = async (req, res) => {
  const city = str(req.query.city, 60);
  res.json(await loadInsights(city.toLowerCase()));
};

let locationsCache = null;
let locationsCacheExpiry = 0;
const LOCATIONS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min memory cache to prevent heavy aggregate scans

const getLocations = async (req, res) => {
  const now = Date.now();
  let allLocations = locationsCache;

  if (!allLocations || now > locationsCacheExpiry) {
    const list = await Property.aggregate([
      { $match: PUBLIC },
      {
        $group: {
          _id: { locality: "$locality", city: "$city" },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          locality: "$_id.locality",
          city: "$_id.city",
          count: 1,
        },
      },
      { $sort: { count: -1 } },
      // Enough pairs that a city-scoped list (?city=) still has localities for smaller cities.
      { $limit: 3000 },
    ]);
    // Imported documents may hold non-string city/locality values; keep only real text.
    const text = (v) => (typeof v === "string" ? v.trim() : "");
    allLocations = list
      .map((l) => ({ locality: text(l.locality), city: text(l.city), count: l.count }))
      .filter((l) => l.city || l.locality)
      .map((l) => ({ ...l, formatted: [l.locality, l.city].filter(Boolean).join(", ") }));
    locationsCache = allLocations;
    locationsCacheExpiry = now + LOCATIONS_CACHE_TTL_MS;
  }

  // str() turns arrays/objects (?search[]=a, ?search[$ne]=x) into "" instead of crashing on .trim().
  const { page, limit } = paging(req.query, { defLimit: 15, maxLimit: 50 });
  const search = (str(req.query.search, 80) || str(req.query.q, 80)).toLowerCase();
  const city = str(req.query.city, 60).toLowerCase();

  let filtered = allLocations;
  if (city) filtered = filtered.filter((l) => l.city.toLowerCase() === city);
  if (search) {
    filtered = filtered.filter(
      (l) =>
        l.locality.toLowerCase().includes(search) ||
        l.city.toLowerCase().includes(search) ||
        l.formatted.toLowerCase().includes(search)
    );
  }

  const total = filtered.length;
  const skip = (page - 1) * limit;
  const paged = filtered.slice(skip, skip + limit);
  const hasMore = skip + paged.length < total;

  res.json({
    locations: paged,
    total,
    page,
    limit,
    hasMore,
  });
};


const getTopRatedProperties = async (req, res) => {
  const limit = Math.min(
    20,
    Math.max(1, parseInt(str(req.query.limit, 3), 10) || 8),
  );
  const ranked = await PropertyRating.find({ count: { $gte: 1 } })
    .sort({ average: -1, count: -1 })
    .limit(limit * 3)
    .lean();
  const order = ranked.map((r) => String(r.property));
  const docs = order.length
    ? await Property.find({
        $and: [PUBLIC, { _id: { $in: ranked.map((r) => r.property) } }],
      }).lean()
    : [];
  docs.sort(
    (a, b) => order.indexOf(String(a._id)) - order.indexOf(String(b._id)),
  );
  res.json({ items: await withRatings(docs.slice(0, limit)) });
};

// Public listings for a comma-separated `ids` query, returned in the order asked for.
async function listingsByIds(query, max, tooMany) {
  const ids = [
    ...new Set(
      str(query.ids, max * 30)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
  if (ids.length > max) throw bad(tooMany);
  if (ids.some((id) => !isPropertyId(id))) throw bad("Invalid property id");
  if (!ids.length) return [];
  const docs = await Property.find({
    $and: [PUBLIC, { _id: { $in: ids.flatMap(propertyIdValues) } }],
  }).lean();
  const items = await withRatings(docs);
  items.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  return items;
}

// Adds what each compared listing's whole project offers - every BHK across its units, its
// starting price and unit count - so the comparison can show "BHK offered" per project.
async function withProjectOffers(items) {
  if (!items.length) return items;
  const index = await loadProjectIndex();
  const groups = items.map((it) => index.groupOf({ _id: it.id, projectKey: it.projectKey }));
  const keys = [...new Set(groups.flatMap((g) => index.keysOf(g)))];
  const units = keys.length
    ? await Property.find({ $and: [PUBLIC, { projectKey: { $in: keys } }] }).select(UNIT_FIELDS).limit(2000).lean()
    : [];
  return items.map((it, i) => {
    const mine = units.filter((u) => index.groupOf(u) === groups[i]);
    const summary = collapseUnits([mine.length ? mine : [{ _id: it.id, bhk: it.bhk, price: it.priceValue }]])[0];
    return withProjectSummary({ ...it }, summary);
  });
}

const getCompareProperties = async (req, res) => {
  const items = await listingsByIds(req.query, 3, "You can compare up to 3 projects at a time");
  res.json({ items: await withProjectOffers(items) });
};

// Full cards for lists the app keeps on the device (e.g. recently viewed).
const getPropertiesByIds = async (req, res) => {
  res.json({ items: await listingsByIds(req.query, 20, "Up to 20 properties at a time") });
};

const getSavedProperties = async (req, res) => {
  const user = await User.findById(req.user.id).lean();
  const saved = user?.savedProperties || []; // stored with each listing's own _id type
  const ids = saved.map(String);
  const docs = ids.length
    ? await Property.find({ $and: [PUBLIC, { _id: { $in: saved } }] }).lean()
    : [];
  const items = await withRatings(docs);
  items.sort((a, b) => ids.indexOf(b.id) - ids.indexOf(a.id)); // most recently saved first
  res.json({ items });
};

// The listing for an id from the URL, whichever type its _id is stored as.
const findListing = (id) => Property.findOne({ _id: propertyIdMatch(requirePropertyId(id)) }).lean();

const ownsListing = (user, doc) => Boolean(user && doc?.ownerUserId && String(doc.ownerUserId) === user.id);

// Every by-id route goes through this: a pending/rejected/hidden listing is a 404 for everyone
// except the user who posted it, exactly as if the id did not exist.
async function findVisibleListing(req) {
  const doc = await findListing(req.params.id);
  if (!doc || !(isPublic(doc) || ownsListing(req.user, doc)))
    throw new AppError(404, "Property not found");
  return doc;
}

const getProperty = async (req, res) => {
  const doc = await findVisibleListing(req);
  const [[item], index] = await Promise.all([withRatings([doc]), loadProjectIndex()]);
  // The merged project (same key the grouped lists and the units picker use).
  res.json({ property: { ...item, projectKey: index.groupOf(doc), isOwner: ownsListing(req.user, doc) } });
};

// GET /api/properties/:id/units – every public unit of this listing's project (the listing itself
// included), ordered by BHK then price. Powers the BHK / size picker on the details screen. A
// listing without a project key is its own only unit.
const UNIT_SUMMARY = ["id", "title", "projectName", "bhk", "price", "priceMin", "priceValue", "area", "propertyType", "image", "possessionStatus"];
const bhkSortRank = (b) => (b === "1RK" ? 0.5 : Number.isFinite(Number(b)) && b !== "" ? Number(b) : 1000);
const getProjectUnits = async (req, res) => {
  const doc = await findVisibleListing(req);
  const { groupOf, keysOf } = await loadProjectIndex();
  const key = groupOf(doc);
  const siblings =
    key === String(doc._id)
      ? []
      : await Property.find({ $and: [PUBLIC, { projectKey: { $in: keysOf(key) } }] }).limit(200).lean();
  const docs = [doc, ...siblings.filter((d) => String(d._id) !== String(doc._id))];
  const units = docs
    .map((d) => {
      const n = normalizeProperty(d);
      const unit = Object.fromEntries(UNIT_SUMMARY.map((k) => [k, n[k]]));
      unit.priceFromValue = unitBasics(d).price;
      return unit;
    })
    .sort(
      (a, b) =>
        bhkSortRank(a.bhk) - bhkSortRank(b.bhk) ||
        (a.priceFromValue ?? Infinity) - (b.priceFromValue ?? Infinity),
    );
  res.json({ projectKey: key, units });
};

async function setSaved(req, res, desired) {
  const exists = await findVisibleListing(req);
  const id = exists._id;
  const user = await User.findById(req.user.id).lean();
  const currently = (user?.savedProperties || []).some(
    (x) => String(x) === String(id),
  );
  const next = desired === undefined ? !currently : desired;
  await User.updateOne(
    { _id: req.user.id },
    next
      ? { $addToSet: { savedProperties: id } }
      : { $pull: { savedProperties: id } },
  );
  res.json({ saved: next });
}
// Body {saved:true|false} makes the call idempotent; with no body it toggles.

const saveProperty = async (req, res) => {
  await setSaved(
    req,
    res,
    typeof req.body?.saved === "boolean" ? req.body.saved : undefined,
  );
};

const deleteSavedProperty = async (req, res) => {
  await setSaved(req, res, false);
};

// ----- Ratings & reviews -------------------------------------------------------------------
async function recompute(propertyId) {
  // Only the rating is needed; skip comments/user data to keep this cheap on busy listings.
  const reviews = await Review.find({ property: propertyId }).select("rating").lean();
  const s = summarise(reviews);
  await PropertyRating.findOneAndUpdate(
    { property: propertyId },
    {
      $set: {
        average: s.average,
        count: s.count,
        distribution: s.distribution,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return s;
}

const getReviews = async (req, res) => {
  await findVisibleListing(req);
  const propertyId = propertyIdMatch(req.params.id);
  const { page, limit, skip } = paging(req.query, {
    defLimit: 10,
    maxLimit: 30,
  });
  const [all, items] = await Promise.all([
    Review.find({ property: propertyId }).lean(),
    Review.find({ property: propertyId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);
  const summary = summarise(all);
  const mine = req.user
    ? all.find((r) => String(r.user) === req.user.id)
    : null;
  const shape = (r) => ({
    id: String(r._id),
    rating: r.rating,
    comment: r.comment || "",
    userName: r.userName || "Verified user",
    createdAt: r.createdAt,
    mine: Boolean(req.user && String(r.user) === req.user.id),
  });
  res.json({
    summary,
    items: items.map(shape),
    myReview: mine ? shape(mine) : null,
    page,
    pages: Math.max(1, Math.ceil(summary.count / limit)),
  });
};

const postReview = async (req, res) => {
  requirePropertyId(req.params.id);
  const { rating, comment } = validate(reviewSchema, req.body);
  const property = await findVisibleListing(req);
  if (property.ownerUserId && String(property.ownerUserId) === req.user.id)
    throw new AppError(403, "You cannot rate your own listing");

  const propertyId = property._id;
  const user = await User.findById(req.user.id).lean();
  const review = await Review.findOneAndUpdate(
    { property: propertyId, user: new mongoose.Types.ObjectId(req.user.id) },
    {
      $set: {
        rating,
        comment,
        userName: (user?.name || "").split(" ")[0] || "",
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  const summary = await recompute(propertyId);
  res.status(201).json({
    review: {
      id: String(review._id),
      rating: review.rating,
      comment: review.comment,
    },
    summary,
  });
};

const deleteReview = async (req, res) => {
  const property = await findVisibleListing(req);
  const propertyId = property._id;
  await Review.deleteOne({
    property: propertyId,
    user: new mongoose.Types.ObjectId(req.user.id),
  });
  res.json({ summary: await recompute(propertyId) });
};

exports.getProperties = getProperties;
exports.getPropertyCount = getPropertyCount;
exports.getPropertyCategories = getPropertyCategories;
exports.getFacets = getFacets;
exports.getLocations = getLocations;
exports.getInsights = getInsights;
exports.getTopRatedProperties = getTopRatedProperties;
exports.getCompareProperties = getCompareProperties;
exports.getPropertiesByIds = getPropertiesByIds;
exports.getSavedProperties = getSavedProperties;
exports.getProperty = getProperty;
exports.getProjectUnits = getProjectUnits;
exports.saveProperty = saveProperty;
exports.deleteSavedProperty = deleteSavedProperty;
exports.getReviews = getReviews;
exports.postReview = postReview;
exports.deleteReview = deleteReview;
exports.withRatings = withRatings;
