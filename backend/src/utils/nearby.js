// "Near me first": when a search carries the person's position (`lat` / `lng`), results are ranked
// by straight-line distance from it. Listings store their position as `coordinates: { lat, lng }`;
// a few older ones only have it inside `mapLink` ("https://maps.google.com/?q=19.2321,72.8553").
// Listings with no usable position go after every listing that has one.
const { str } = require('./validate');

// Extra fields a scan must load to place a listing.
const POSITION_FIELDS = 'coordinates mapLink';

// The sorts that become "nearest first" when a position is given. Explicit choices (price, newest,
// top rated) keep their meaning.
const NEAREST_SORTS = new Set(['', 'relevance', 'nearest']);

const valid = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

// The search origin from the query string, or null.
function originOf(query = {}) {
  const lat = Number(str(query.lat, 20));
  const lng = Number(str(query.lng, 20));
  return str(query.lat, 20) && str(query.lng, 20) && valid(lat, lng) ? { lat, lng } : null;
}

const MAP_Q = /[?&](?:q|query|ll)=(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/;

// A listing's position, or null.
function positionOf(doc) {
  const c = doc && doc.coordinates;
  if (c && typeof c === 'object') {
    const lat = Number(c.lat ?? c.latitude);
    const lng = Number(c.lng ?? c.lon ?? c.longitude);
    if (valid(lat, lng)) return { lat, lng };
  }
  const m = typeof doc?.mapLink === 'string' && doc.mapLink.match(MAP_Q);
  if (m) {
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (valid(lat, lng)) return { lat, lng };
  }
  return null;
}

// Great-circle distance in kilometres.
function distanceKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// `rows` nearest first. Stable: rows at the same distance keep their incoming order (relevance).
function byDistance(rows, origin) {
  return rows
    .map((row, i) => {
      const pos = positionOf(row);
      return { row, i, d: pos ? distanceKm(origin, pos) : Infinity };
    })
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map((x) => x.row);
}

module.exports = { POSITION_FIELDS, NEAREST_SORTS, originOf, positionOf, distanceKm, byDistance };
