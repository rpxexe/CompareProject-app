// Free-text property search: turns whatever someone types ("2 bhk flat for rent under 30k in
// andheri") into structured filters plus the leftover words, and corrects misspelt words
// against the words that actually occur in listings.
const { escapeRegex } = require('./validate');

const UNIT = '(crores?|cr|lakhs?|lacs?|l|k)?';
const NUM = '(\\d+(?:\\.\\d+)?)';
const money = (n, unit) => {
  const u = (unit || '').toLowerCase();
  const mult = u.startsWith('c') ? 1e7 : u.startsWith('l') ? 1e5 : u === 'k' ? 1e3 : 1;
  return Math.round(parseFloat(n) * mult);
};

// "3bhk under 50 lakh in Whitefield" -> { bhk: 3, maxPrice: 5000000, place: "whitefield", text: "" }
// (Used as-is by the v2 instant search.)
function parseQuery(text) {
  let t = ` ${text.toLowerCase()} `;
  const out = {};
  const take = (re, fn) => {
    const m = t.match(re);
    if (m) {
      fn(m);
      t = t.replace(m[0], ' ');
    }
  };
  take(new RegExp(`\\bbetween\\s+${NUM}\\s*${UNIT}\\s+(?:and|to|-)\\s+${NUM}\\s*${UNIT}\\b`), (m) => {
    out.minPrice = money(m[1], m[2] || m[4]);
    out.maxPrice = money(m[3], m[4]);
  });
  take(new RegExp(`\\b(?:under|below|less than|within|upto|up to|max)\\s+${NUM}\\s*${UNIT}\\b`), (m) => { out.maxPrice = money(m[1], m[2]); });
  take(new RegExp(`\\b(?:above|over|more than|min|starting|from)\\s+${NUM}\\s*${UNIT}\\b`), (m) => { out.minPrice = money(m[1], m[2]); });
  take(/\b(?:1\s*-?\s*)?rk\b/, () => { out.bhk = 'rk'; }); // one room + kitchen
  take(/\b(\d{1,2})\s*-?\s*bhk\b/, (m) => { out.bhk = Number(m[1]); });
  take(/\brera(?:\s*(?:approved|registered))?\b/, () => { out.rera = true; });
  take(/\bsemi[\s-]*furnished\b/, () => { out.furnishing = 'semi'; });
  take(/\bun[\s-]*furnished\b/, () => { out.furnishing = 'unfurnished'; });
  take(/\b(?:fully\s+)?furnished\b/, () => { out.furnishing = 'furnished'; });
  take(/\bin\s+([\p{L}][\p{L}\s.-]{1,60}?)\s*$/u, (m) => { out.place = m[1].trim(); });
  out.text = t.replace(/\s+/g, ' ').trim();
  return out;
}

// Canonical type keys (filterFields TYPES) for the words people type. Longer phrases first.
const TYPE_WORDS = [
  ['builder_floor', /\bbuilder\s*floors?\b/],
  ['commercial_land', /\b(?:commercial|industrial)\s+(?:land|plots?)\b/],
  ['independent_house', /\b(?:independent\s+house|row\s*houses?|bungalows?|houses?|kothi)\b/],
  ['penthouse', /\bpenthouses?\b/],
  ['apartment', /\b(?:flats?|apartments?|studios?)\b/],
  ['villa', /\bvillas?\b/],
  ['plot', /\bplots?\b/],
  ['land', /\blands?\b/],
  ['coworking', /\bco-?working(?:\s+spaces?)?\b/],
  ['office', /\boffices?(?:\s+spaces?)?\b/],
  ['showroom', /\bshowrooms?\b/],
  ['shop', /\b(?:shops?|retail)\b/],
  ['warehouse', /\b(?:warehouses?|godowns?)\b/],
  ['pg', /\b(?:pg|paying\s+guest|hostels?|co-?living)\b/],
];
const POSSESSION_WORDS = [
  ['ready', /\b(?:ready(?:\s+to\s+move(?:\s+in)?)?|rtm|immediate\s+possession)\b/],
  ['under_construction', /\b(?:under[\s-]*construction|ongoing)\b/],
  ['new_launch', /\b(?:(?:new|pre)[\s-]*launch(?:es|ed)?|newly\s+launched)\b/],
  ['upcoming', /\bupcoming\b/],
];
const RENT = /\b(?:for\s+)?(?:rent|rental|renting|lease|leasing|to[\s-]let)\b/;
const SALE = /\b(?:for\s+)?(?:sale|sell|selling|buy|buying|purchase|resale)\b/;
// Filler that would otherwise have to appear in a listing.
const STOPWORDS = new Set([
  'a', 'an', 'the', 'in', 'at', 'on', 'of', 'for', 'to', 'and', 'or', 'with', 'near', 'nearby', 'around', 'by',
  'me', 'my', 'i', 'show', 'find', 'search', 'want', 'need', 'looking', 'property', 'properties', 'home', 'homes',
  'bhk', 'budget', 'price', 'rs', 'inr', 'only', 'best', 'cheap', 'good', 'new', 'available',
]);
const MAX_WORDS = 8;

// ----- Aliases ---------------------------------------------------------------------------------
// People type the name they know; the listings use one spelling. Every word in a group matches
// listings written with any other ("bengaluru" finds Bangalore, "vizag" finds Visakhapatnam).
const ALIAS_GROUPS = [
  ['bangalore', 'bengaluru', 'banglore', 'blr'],
  ['gurgaon', 'gurugram', 'ggn'],
  ['mumbai', 'bombay'],
  ['kolkata', 'calcutta'],
  ['chennai', 'madras'],
  ['pune', 'poona'],
  ['vadodara', 'baroda'],
  ['visakhapatnam', 'vishakhapatnam', 'vizag', 'vsp'],
  ['mysore', 'mysuru'],
  ['thiruvananthapuram', 'trivandrum'],
  ['puducherry', 'pondicherry'],
  ['kochi', 'cochin'],
  ['hyderabad', 'hyd'],
  ['ahmedabad', 'amdavad'],
  ['prayagraj', 'allahabad'],
];
const ALIASES = new Map();
for (const group of ALIAS_GROUPS) {
  for (const w of group) ALIASES.set(w, [...new Set([...(ALIASES.get(w) || []), ...group])]);
}
// Multi-word names and short forms, rewritten to the listings' wording before parsing.
const PHRASES = [
  [/\bnoida\s+ext(?:ension|n)?\b/g, 'greater noida west'],
  [/\b(?:gr\.?|grt)\s+noida\b/g, 'greater noida'],
  [/\be[\s-]?city\b/g, 'electronic city'],
  [/\bnavi\s*mumbai\b|\bnm\b/g, 'navi mumbai'],
  [/\bhitech\s*city\b/g, 'hitec city'],
];

// Whatever was typed -> { params: filters it names, words: what's left to match in listings }.
// `params` uses the /properties query names (bhk, minPrice, maxPrice, deal, propertyTypes,
// possession, furnishing, rera), so explicit filters can override them.
function parseSearch(text) {
  const normalised = String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.+-]/gu, ' ')
    .replace(/\b(\d{1,2})\s*-?\s*(?:b\.?h\.?k|beds?|bedrooms?|bed\s*rooms?)\b/g, '$1 bhk')
    .replace(/\b1\s*-?\s*rk\b/g, 'rk');
  const p = parseQuery(PHRASES.reduce((t, [re, to]) => t.replace(re, to), normalised));
  let t = ` ${p.text} ${p.place || ''} `;
  const params = {};
  if (p.bhk) params.bhk = String(p.bhk);
  if (p.minPrice) params.minPrice = String(p.minPrice);
  if (p.maxPrice) params.maxPrice = String(p.maxPrice);
  if (p.rera) params.rera = 'true';
  if (p.furnishing) params.furnishing = p.furnishing;

  const strip = (re) => {
    const m = t.match(re);
    if (m) t = t.replace(re, ' ');
    return !!m;
  };
  // A budget with a unit but no "under" ("flat 80 lakh", "2 cr") is the most they'll pay.
  if (!params.maxPrice && !params.minPrice) {
    const m = t.match(new RegExp(`\\b${NUM}\\s*(crores?|cr|lakhs?|lacs?|l|k)\\b`));
    if (m) {
      params.maxPrice = String(money(m[1], m[2]));
      t = t.replace(m[0], ' ');
    }
  }
  if (strip(RENT)) params.deal = 'rent';
  else if (strip(SALE)) params.deal = 'sale';
  const types = TYPE_WORDS.filter(([, re]) => strip(new RegExp(re.source, 'g'))).map(([k]) => k);
  if (types.length) params.propertyTypes = types;
  const possession = POSSESSION_WORDS.filter(([, re]) => strip(new RegExp(re.source, 'g'))).map(([k]) => k);
  if (possession.length) params.possession = possession;

  const words = [...new Set(t.split(/[\s.+-]+/))]
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    // Short bare numbers ("2", "15") mean nothing on their own; pincodes and the like stay.
    .filter((w) => !/^\d{1,2}$/.test(w))
    .slice(0, MAX_WORDS);
  return { params, words };
}

// A word must start a word in the field: "andheri" finds "Andheri West", "rent" doesn't find "Parent".
// A word with aliases matches any of them ("bengaluru" finds "Bangalore").
const wordRegex = (word) => {
  const alts = ALIASES.get(String(word).toLowerCase()) || [word];
  return new RegExp(`\\b(?:${alts.map(escapeRegex).join('|')})`, 'i');
};

// A place name (city / locality filter) that also matches its aliases, word by word: the phone's
// GPS says "Bengaluru" or "Gurugram" where listings say "Bangalore" / "Gurgaon".
function placeRegex(text) {
  const pattern = String(text || '')
    .split(/(\s+)/)
    .map((tok) => {
      const alts = ALIASES.get(tok.toLowerCase());
      if (alts) return `(?:${alts.map(escapeRegex).join('|')})`;
      return /^\s+$/.test(tok) ? '\\s+' : escapeRegex(tok);
    })
    .join('');
  return new RegExp(pattern, 'i');
}

// ----- Typo correction ------------------------------------------------------------------------
// Lower-case words (3+ letters) from listing names and places -> how often each occurs.
function buildVocabulary(docs, fields) {
  const vocab = new Map();
  for (const d of docs) {
    for (const f of fields) {
      const v = d[f];
      if (typeof v !== 'string') continue;
      for (const w of v.toLowerCase().match(/\p{L}{3,}/gu) || []) vocab.set(w, (vocab.get(w) || 0) + 1);
    }
  }
  return vocab;
}

// Edit distance with an early exit once it's beyond `max`.
function distance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

// The closest listing word for a word nobody's listing contains, or null to leave it alone.
function correctWord(word, vocab) {
  if (!/^\p{L}{4,}$/u.test(word) || vocab.has(word) || ALIASES.has(word)) return null;
  for (const v of vocab.keys()) if (v.startsWith(word)) return null; // still being typed
  const max = word.length <= 5 ? 1 : 2;
  let best = null;
  let bestD = max + 1;
  let bestN = 0;
  for (const [v, n] of vocab) {
    const d = distance(word, v, max);
    if (d < bestD || (d === bestD && d <= max && n > bestN)) {
      best = v;
      bestD = d;
      bestN = n;
    }
  }
  return bestD <= max ? best : null;
}

// Two listing words typed as one ("lodhaaltus" -> "lodha altus"), or null. Prefers the split whose
// rarer half is most common, so real words win over accidental pairs.
function splitWord(word, vocab) {
  if (!/^\p{L}{6,}$/u.test(word) || vocab.has(word) || ALIASES.has(word)) return null;
  let best = null;
  let bestN = 0;
  for (let i = 3; i <= word.length - 3; i += 1) {
    const a = word.slice(0, i);
    const b = word.slice(i);
    const n = Math.min(vocab.get(a) || 0, vocab.get(b) || 0);
    if (n > bestN) {
      best = `${a} ${b}`;
      bestN = n;
    }
  }
  return best;
}

// The search text with misspelt words swapped for listing words, or null when nothing changed:
// a listing word typed in two parts is joined ("white field" -> "whitefield"), two typed as one
// are split, then each word left unknown gets the closest listing word.
function correctSearch(text, vocab) {
  let out = String(text || '').toLowerCase();
  let changed = false;
  const swap = (from, to) => {
    out = out.replace(new RegExp(`\\b${from}\\b`, 'g'), to);
    changed = true;
  };
  const first = parseSearch(out).words;
  for (let i = 0; i + 1 < first.length; i += 1) {
    const joined = first[i] + first[i + 1];
    if (vocab.has(joined)) swap(`${escapeRegex(first[i])}\\s+${escapeRegex(first[i + 1])}`, joined);
  }
  for (const w of parseSearch(out).words) {
    const fix = splitWord(w, vocab) || correctWord(w, vocab);
    if (fix) swap(escapeRegex(w), fix);
  }
  return changed ? out.replace(/\s+/g, ' ').trim() : null;
}

// Listing words within a typo or two of `word` (itself excluded), closest and most common first.
// For a word that is a real listing word but not the one meant ("altis" when "altus" was meant).
function nearWords(word, vocab, limit = 2) {
  if (!/^\p{L}{4,}$/u.test(word)) return [];
  const max = word.length <= 5 ? 1 : 2;
  const out = [];
  for (const [v, n] of vocab) {
    if (v === word) continue;
    const d = distance(word, v, max);
    if (d <= max) out.push([v, d, n]);
  }
  return out.sort((a, b) => a[1] - b[1] || b[2] - a[2]).slice(0, limit).map(([v]) => v);
}

// Filler left dangling at either end once a word is removed ("3 bhk in" -> "3 bhk").
const EDGE_FILLER = /^(?:(?:in|at|on|of|for|near|with|and|or|the)\s+)+|(?:\s+(?:in|at|on|of|for|near|with|and|or|the))+$/g;

// The search text with `word` swapped for `to` (whole words only); `to` = '' drops it.
function replaceWord(text, word, to) {
  return String(text || '')
    .toLowerCase()
    .replace(new RegExp(`\\b${escapeRegex(word)}\\b`, 'g'), to)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(EDGE_FILLER, '')
    .trim();
}
const dropWord = (text, word) => replaceWord(text, word, '');

module.exports = { parseQuery, parseSearch, wordRegex, placeRegex, buildVocabulary, correctWord, correctSearch, splitWord, nearWords, replaceWord, dropWord, ALIASES };
